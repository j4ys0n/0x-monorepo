import { Callback, NextCallback, Subprovider } from '@0xproject/subproviders';
import { promisify } from '@0xproject/utils';
import * as fs from 'fs';
import * as glob from 'glob';
import { Collector } from 'istanbul';
import * as _ from 'lodash';
import * as path from 'path';
import * as Web3 from 'web3';

import { instrumentSolidity } from './instrument_solidity';
import { parseSourceMap } from './source_maps';
import { LineColumn, SingleFileSourceRange, SourceRange } from './types';

// tslint:disable:no-console
const NEW_CONTRACT = 'NEW_CONTRACT';

export interface LineCoverage {
    [lineNo: number]: number;
}

export interface FunctionCoverage {
    [functionId: number]: number;
}

export interface StatementCoverage {
    [statementId: number]: number;
}

export interface BranchCoverage {
    [branchId: number]: number[];
}

export interface SingleFileSourceRange {
    start: LineColumn;
    end: LineColumn;
}

export interface FunctionDescription {
    name: string;
    line: number;
    loc: SingleFileSourceRange;
    skip?: boolean;
}

export type StatementDescription = SingleFileSourceRange;

export interface BranchDescription {
    line: number;
    type: string;
    locations: SingleFileSourceRange[];
}

export interface FinalCoverage {
    [fineName: string]: {
        l: LineCoverage;
        f: FunctionCoverage;
        s: StatementCoverage;
        b: BranchCoverage;
        fnMap: {
            [functionId: number]: FunctionDescription;
        };
        branchMap: {
            [branchId: number]: BranchDescription;
        };
        statementMap: {
            [statementId: number]: StatementDescription;
        };
        path: string;
    };
}

interface ContractData {
    bytecode: string;
    sourceMap: string;
    runtimeBytecode: string;
    sourceMapRuntime: string;
    sourceCodes: string[];
    baseName: string;
    sources: string[];
}

interface TraceInfo {
    coveredPcs: number[];
    txHash: string;
}

const compareLineColumn = (lhs: LineColumn, rhs: LineColumn) => {
    return lhs.line !== rhs.line ? lhs.line - rhs.line : lhs.column - rhs.column;
};

const isRangeInside = (childRange: SingleFileSourceRange, parentRange: SingleFileSourceRange) => {
    return (
        compareLineColumn(parentRange.start, childRange.start) <= 0 &&
        compareLineColumn(childRange.end, parentRange.end) <= 0
    );
};

const getSingleFileCoverageForTrace = (
    contractData: ContractData,
    coveredPcs: number[],
    pcToSourceRange: { [programCounter: number]: SourceRange },
    fileIndex: number,
) => {
    const fileName = contractData.sources[fileIndex];
    const instrumentedSolidity = instrumentSolidity(contractData.sourceCodes[fileIndex], fileName);
    let sourceRanges = _.map(coveredPcs, coveredPc => pcToSourceRange[coveredPc]);
    sourceRanges = _.compact(sourceRanges);
    sourceRanges = _.uniqBy(sourceRanges, s => JSON.stringify(s));
    sourceRanges = _.filter(sourceRanges, sourceRange => sourceRange.fileName === fileName);
    const branchCoverage: BranchCoverage = {};
    _.forEach(instrumentedSolidity.branchMap, (branchDescription: BranchDescription, branchId: number) => {
        const isCovered = _.map(branchDescription.locations, location =>
            Number(_.some(sourceRanges, range => isRangeInside(range.location, location))),
        );
        branchCoverage[branchId] = isCovered;
    });
    const statementCoverage: StatementCoverage = {};
    _.forEach(instrumentedSolidity.statementMap, (statementDescription: StatementDescription, statementId: number) => {
        const isCovered = Number(_.some(sourceRanges, range => isRangeInside(range.location, statementDescription)));
        statementCoverage[statementId] = isCovered;
    });
    const functionCoverage: FunctionCoverage = {};
    _.forEach(instrumentedSolidity.fnMap, (functionDescription: FunctionDescription, fnId: number) => {
        const isCovered = Number(_.some(sourceRanges, range => isRangeInside(range.location, functionDescription.loc)));
        functionCoverage[fnId] = isCovered;
    });
    _.forEach(sourceRanges, range => {
        const isWithinSomeStatement = _.some(
            instrumentedSolidity.statementMap,
            (statementDescription: StatementDescription) => isRangeInside(range.location, statementDescription),
        );
        if (!isWithinSomeStatement) {
            console.log(range);
        }
    });
    const partialCoverage = {
        [contractData.sources[fileIndex]]: {
            fnMap: instrumentedSolidity.fnMap,
            branchMap: instrumentedSolidity.branchMap,
            statementMap: instrumentedSolidity.statementMap,
            l: {},
            path: fileName,
            f: functionCoverage,
            s: statementCoverage,
            b: branchCoverage,
        },
    };
    return partialCoverage;
};

/*
 * This class implements the web3-provider-engine subprovider interface and collects traces of all transactions that were sent.
 * Source: https://github.com/MetaMask/provider-engine/blob/master/subproviders/subprovider.js
 */
export class CoverageSubprovider extends Subprovider {
    private _traceInfoByAddress: { [address: string]: TraceInfo[] } = {};
    private _contractsData: ContractData[] = [];
    private _txDataByHash: { [txHash: string]: string } = {};
    constructor(artifactsPath: string, sourcesPath: string, networkId: number) {
        super();
        const sourcesGlob = `${sourcesPath}/**/*.sol`;
        const sourceFileNames = glob.sync(sourcesGlob, { absolute: true });
        for (const sourceFileName of sourceFileNames) {
            const baseName = path.basename(sourceFileName, '.sol');
            const artifactFileName = path.join(artifactsPath, `${baseName}.json`);
            if (!fs.existsSync(artifactFileName)) {
                // If the contract isn't directly compiled, but is imported as the part of the other contract - we don't have an artifact for it and therefore can't do anything usefull with it
                continue;
            }
            const artifact = JSON.parse(fs.readFileSync(artifactFileName).toString());
            const sources = _.map(artifact.networks[networkId].sources, source => {
                const includedFileName = glob.sync(`${sourcesPath}/**/${source}`, { absolute: true })[0];
                return includedFileName;
            });
            const sourceCodes = _.map(sources, source => {
                const includedSourceCode = fs.readFileSync(source).toString();
                return includedSourceCode;
            });
            const contractData = {
                baseName,
                sourceCodes,
                sources,
                sourceMap: artifact.networks[networkId].source_map,
                sourceMapRuntime: artifact.networks[networkId].source_map_runtime,
                runtimeBytecode: artifact.networks[networkId].runtime_bytecode,
                bytecode: artifact.networks[networkId].bytecode,
            };
            this._contractsData.push(contractData);
        }
    }
    // This method needs to be here to satisfy the interface but linter wants it to be static.
    // tslint:disable-next-line:prefer-function-over-method
    public handleRequest(
        payload: Web3.JSONRPCRequestPayload,
        next: NextCallback,
        end: (err: Error | null, result: any) => void,
    ) {
        switch (payload.method) {
            case 'eth_sendTransaction':
                const txData = payload.params[0];
                next(this._onTransactionSentAsync.bind(this, txData));
                return;

            case 'eth_call':
                const callData = payload.params[0];
                const blockNumber = payload.params[1];
                next(this._onCallExecutedAsync.bind(this, callData, blockNumber));
                return;

            default:
                next();
                return;
        }
    }
    public async computeCoverageAsync(): Promise<FinalCoverage> {
        const collector = new Collector();
        // Runtime transactions
        for (const address of _.keys(this._traceInfoByAddress)) {
            if (address === NEW_CONTRACT) {
                continue;
            }
            const runtimeBytecode = await this._getContractCodeAsync(address);
            const contractData = _.find(this._contractsData, { runtimeBytecode }) as ContractData;
            if (_.isUndefined(contractData)) {
                throw new Error(`Transaction to an unknown address: ${address}`);
            }
            const bytecodeHex = contractData.runtimeBytecode.slice(2);
            const sourceMap = contractData.sourceMapRuntime;
            const pcToSourceRange = parseSourceMap(
                contractData.sourceCodes,
                sourceMap,
                bytecodeHex,
                contractData.sources,
            );
            for (let i = 0; i < contractData.sources.length; i++) {
                _.forEach(this._traceInfoByAddress[address], (traceInfo: TraceInfo) => {
                    const singleFileCoverageForTrace = getSingleFileCoverageForTrace(
                        contractData,
                        traceInfo.coveredPcs,
                        pcToSourceRange,
                        i,
                    );
                    collector.add(singleFileCoverageForTrace);
                });
            }
        }
        // Contract creation transactions
        for (const address of _.keys(this._traceInfoByAddress)) {
            if (address !== NEW_CONTRACT) {
                continue;
            }
            _.forEach(this._traceInfoByAddress[address], (traceInfo: TraceInfo) => {
                const bytecode = this._txDataByHash[traceInfo.txHash];
                const contractData = _.find(this._contractsData, contractDataCandidate =>
                    bytecode.startsWith(contractDataCandidate.bytecode),
                ) as ContractData;
                if (_.isUndefined(contractData)) {
                    throw new Error(`Unknown contract creation transaction`);
                }
                const bytecodeHex = contractData.bytecode.slice(2);
                const sourceMap = contractData.sourceMap;
                const pcToSourceRange = parseSourceMap(
                    contractData.sourceCodes,
                    sourceMap,
                    bytecodeHex,
                    contractData.sources,
                );
                for (let i = 0; i < contractData.sources.length; i++) {
                    const singleFileCoverageForTrace = getSingleFileCoverageForTrace(
                        contractData,
                        traceInfo.coveredPcs,
                        pcToSourceRange,
                        i,
                    );
                    collector.add(singleFileCoverageForTrace);
                }
            });
        }
        return (collector as any).getFinalCoverage();
    }
    public async writeCoverageAsync(): Promise<void> {
        const finalCoverage = await this.computeCoverageAsync();
        fs.writeFileSync('coverage/coverage.json', JSON.stringify(finalCoverage, null, 2));
    }
    private async _onTransactionSentAsync(
        txData: Web3.TxData,
        err: Error | null,
        txHash: string,
        cb?: Callback,
    ): Promise<void> {
        if (_.isNull(err)) {
            await this._recordTxTraceAsync(txData.to || NEW_CONTRACT, txData.data, txHash);
        } else {
            const payload = {
                method: 'eth_getBlockByNumber',
                params: ['latest', true],
            };
            const jsonRPCResponsePayload = await this.emitPayloadAsync(payload);
            const transactions = jsonRPCResponsePayload.result.transactions;
            for (const transaction of transactions) {
                await this._recordTxTraceAsync(transaction.to || NEW_CONTRACT, transaction.data, transaction.hash);
            }
        }
        if (!_.isUndefined(cb)) {
            cb();
        }
    }
    private async _onCallExecutedAsync(
        callData: Partial<Web3.CallData>,
        blockNumber: Web3.BlockParam,
        err: Error | null,
        callResult: string,
        cb: Callback,
    ): Promise<void> {
        await this._recordCallTraceAsync(callData, blockNumber);
        cb();
    }
    private async _recordTxTraceAsync(address: string, data: string | undefined, txHash: string): Promise<void> {
        this._txDataByHash[txHash] = data || '';
        const payload = {
            method: 'debug_traceTransaction',
            params: [txHash, { disableMemory: true, disableStack: true, disableStorage: true }], // TODO For now testrpc just ignores those parameters https://github.com/trufflesuite/ganache-cli/issues/489
        };
        const jsonRPCResponsePayload = await this.emitPayloadAsync(payload);
        const trace: Web3.TransactionTrace = jsonRPCResponsePayload.result;
        const coveredPcs = _.map(trace.structLogs, log => log.pc);
        this._traceInfoByAddress[address] = [
            ...(this._traceInfoByAddress[address] || ([] as TraceInfo[])),
            { coveredPcs, txHash },
        ];
    }
    private async _recordCallTraceAsync(callData: Partial<Web3.CallData>, blockNumber: Web3.BlockParam): Promise<void> {
        const snapshotId = Number((await this.emitPayloadAsync({ method: 'evm_snapshot' })).result);
        const txData = callData;
        if (_.isUndefined(txData.from)) {
            txData.from = '0x5409ed021d9299bf6814279a6a1411a7e866a631';
        }
        const txDataWithFromAddress = txData as Web3.TxData & { from: string };
        const txHash = (await this.emitPayloadAsync({ method: 'eth_sendTransaction', params: [txDataWithFromAddress] }))
            .result;
        await this._onTransactionSentAsync(txDataWithFromAddress, null, txHash);
        const didRevert = (await this.emitPayloadAsync({ method: 'evm_revert', params: [snapshotId] })).result;
    }
    private async _getContractCodeAsync(address: string): Promise<string> {
        const payload = {
            method: 'eth_getCode',
            params: [address, 'latest'],
        };
        const jsonRPCResponsePayload = await this.emitPayloadAsync(payload);
        const contractCode: string = jsonRPCResponsePayload.result;
        return contractCode;
    }
}

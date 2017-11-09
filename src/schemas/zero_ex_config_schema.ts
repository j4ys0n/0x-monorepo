export const zeroExConfigSchema = {
    id: '/ZeroExConfig',
    properties: {
        gasPrice: {$ref: '/Number'},
        exchangeContractAddress: {$ref: '/Address'},
        tokenRegistryContractAddress: {$ref: '/Address'},
        etherTokenContractAddress: {$ref: '/Address'},
        orderWatcherConfig: {
            type: 'object',
            properties: {
                pollingIntervalMs: {
                    type: 'number',
                    minimum: 0,
                },
            },
        },
    },
    type: 'object',
};

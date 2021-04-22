module.exports = function () {
    return {
        files: [
            'src/*.js',
            'src/**/*.js' // adjust if required
        ],
        tests: [
            'test/*.spec.js',
            'test/**/*.spec.js' // adjust if required
        ],
        env: {
            type: 'node'
        },
        testFramework: 'mocha',
        debug: true
    };
};
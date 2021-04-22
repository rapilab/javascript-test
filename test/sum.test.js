const sum = require('../src/sum');

test('adds 1 + 2 to equal 3', () => {
    let actual = sum(1, 2);
    expect(actual).toBe(3);
});

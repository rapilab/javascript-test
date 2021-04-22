function sum(a, b) {
    let c = 1;
    c = c + 1;
    let newVar = a + b;
    c = c + 2;
    console.log(c);
    return newVar;
}

module.exports = sum;


sum(4, 5);

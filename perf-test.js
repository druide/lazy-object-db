const lazyDb = require('.');

const REPEAT = 1e4;

// connect to the environment and DB
var env = lazyDb.open({
    path: './data',
    maxDbs: 10,
    mapSize: 800 * 1024 * 1024
});

var dbi1 = env.openDbi({
   name: 'test1',
   create: true
});

var dbi2 = env.openDbi({
   name: 'test2',
   create: true
});

function testDirectWrite () {
    console.time('direct write');

    var txn = dbi1.env.beginTxn();

    for (var i = 0; i < REPEAT; i++) {
        var data = {
            a: Math.random(),
            b: Math.random().toString(16),
            c: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            d: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            e: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            f: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            g: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            h: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd'
        };
        txn.put(dbi1, 'key' + i, data);
    }

    txn.commit();
    console.timeEnd('direct write');
}

function testLazyWrite () {
    console.time('lazy write');

    var txn = dbi2.env.beginTxn();
    var obj = lazyDb.write('test', dbi2, txn);

    for (var i = 0; i < REPEAT; i++) {
        var data = {
            a: Math.random(),
            b: Math.random().toString(16),
            c: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            d: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            e: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            f: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            g: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd',
            h: 'dsfdsfdsfsidfksdfknsdfknsdjfsdfhsdjfnsdkjfnsjdnfjsdfkjsdfkjsd'
        };
        obj['key' + i] = data;
    }

    txn.commit();
    console.timeEnd('lazy write');
}

function testDirectRead () {
    console.time('direct read');

    var txn = dbi1.env.beginTxn({readOnly: true});
    var temp;

    for (var i = 0; i < REPEAT; i++) {
        temp = txn.get(dbi1, 'key' + i);
        if (typeof temp.a !== 'number') throw new Error('Broken data');
    }

    txn.abort();
    console.timeEnd('direct read');
}

function testLazyRead () {
    console.time('lazy read');

    var txn = dbi2.env.beginTxn({readOnly: true});
    var obj = lazyDb.read('test', dbi2, txn);
    var temp;

    for (var i = 0; i < REPEAT; i++) {
        temp = obj['key' + i];
        if (typeof temp.a !== 'number') throw new Error('Broken data');
        // if (typeof temp.c !== 'string') throw new Error('Broken data');
    }

    txn.abort();
    console.timeEnd('lazy read');
}

testLazyWrite();
testDirectWrite();
testLazyRead();
testDirectRead();

//lazyDb.printDb(dbi2);

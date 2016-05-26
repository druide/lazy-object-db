const lazyDb = require('.');
const LazyDbRead = lazyDb.Read;
const LazyDbWrite = lazyDb.Write;

// connect to the environment and DB
var env = lazyDb.open({
    path: './data'
});

var dbi = env.openDbi({
   name: 'test',
   create: true
});

// create lazy object for write
var obj1 = LazyDbWrite('MyId1', dbi);

// write properties
obj1.foo = 'Hello world!';
obj1.foo2 = 12345;
obj1.prop3.sub1 = 'sub1 str for prop3';
obj1.prop4.sub1 = 'sub1 str for prop4';
obj1.example = {
    key1: 'abcde',
    key2: 123123,
    key3: {
        subKey1: 'xyz',
        subKey2: -12
    }
};

// create lazy object for read
var obj = LazyDbRead('MyId1', dbi);

console.log('Object:');
console.log('---------------------');

// look at the keys
console.log('object on start:', obj); // see it is not loaded yet
console.log('object keys:', Reflect.ownKeys(obj)); // but it have keys
console.log('');

// access some properties
console.log('foo:', obj.foo);
console.log('foo2:', obj.foo2);
console.log('prop3:', obj.prop3);
console.log('prop3.sub1:', obj.prop3.sub1);
console.log('prop4.sub1:', obj.prop4.sub1);
console.log('example.key2:', obj.example.key2);
console.log('example.key3:', obj.example.key3.subKey1);
console.log('example.key3 keys:', Reflect.ownKeys(obj.example.key3));
console.log('');

console.log('object on finish:', obj);

console.log('\nDB:');
lazyDb.printDb(dbi);

dbi.close();
env.close();

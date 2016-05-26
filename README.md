LazyDb
=========

This is an object-oriented lazy loading DB for Node.js.
[node-lmdb](https://github.com/druide/node-lmdb) is used as storage.
Principle: you create an instance of object with unique ID, connected to the DB. Object is empty on start.
Reading and writing the properties of this object is transparently converted to DB read and writes.
After accessing a property, it will be synchronized with DB automatically.

Example
-------

```javascript
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
```

API
-------

### lazyDb.open

`lazyDb.open(Object options) -> Object`

Open LMDB environment. `options.path` is direcory for db (required). Returns environment object, which have method
to open and create database. See [node-lmdb docs](https://github.com/druide/node-lmdb) for options.

Example:

```javascript
// connect to the environment and DB
var env = lazyDb.open({
    path: './data'
});

var dbi = env.openDbi({
   name: 'test',
   create: true
});
```

### lazyDb.Read

`lazyDb.Read(String key, Object dbi, [Object txn]) -> Proxy`

Create object connected to database `dbi` with unique key `key`. If transaction `txn` is passed, object will use it,
otherwise internal transaction(s) will be started.
Returned object can be modified, but nothing will be written to database. Reading from database is performed
once on first property access. To use updated db values, create new read object. 

### lazyDb.Write

`lazyDb.Write(String key, Object dbi, [Object txn]) -> Proxy`

Create object connected to database `dbi` with unique key `key`. If transaction `txn` is passed, object will use it,
otherwise internal transaction(s) will be started.
When properties of returned object are modified, they are automatically stored in database.

### lazyDb.printDb

`lazyDb.printDb(Object dbi, [Number skip = 0], [Number limit = 100])`

Prints content of db to console.

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

// connect to the environment and DB
var env = lazyDb.open({
    path: './data'
});

var dbi = env.openDbi({
   name: 'test',
   create: true
});

// create lazy object for write
var obj1 = lazyDb.write('MyId1', dbi);

// write properties
obj1.foo = 'Hello world!';
obj1.foo2 = 12345;
obj1.example = {
    key1: 'abcde',
    key2: 123123,
    key3: {
        subKey1: 'xyz',
        subKey2: -12
    }
};
obj1.array = [1, 2, 3];
delete obj1.arr;


// create lazy object with cache for read
var obj = lazyDb.read('MyId1', dbi, null, true);

console.log('Object (MyId1):');
console.log('---------------------');

// look at the keys
console.log('object on start:', obj); // see it is not loaded yet
console.log('object keys:', Reflect.ownKeys(obj)); // but it have keys
console.log('');

// access some properties
console.log('foo:', obj.foo);
console.log('foo2:', obj.foo2);

console.log('example:', obj.example);
console.log('example.key3 keys:', Reflect.ownKeys(obj.example.key3));
console.log('example.key2:', obj.example.key2);
console.log('example.key3:', obj.example.key3.subKey1);

console.log('array:', obj.array);
console.log('array keys:', Reflect.ownKeys(obj.array));
console.log('array[0]:', obj.array[0]);
console.log('array[2]:', obj.array[2]);
console.log('');

console.log('object on finish:', obj);
console.log('');

// get sub-object from property `example`
var subObj = lazyDb.read('MyId1.example', dbi, null, true);
console.log('Sub object (MyId1.example):');
console.log('---------------------');

console.log('key2:', subObj.key2);
console.log('key3.subKey1:', subObj.key3.subKey1);
console.log('key3 keys:', Reflect.ownKeys(subObj.key3));
console.log('');

console.log('Sub object on finish:', subObj);
console.log('');

var subObj2 = lazyDb.read('MyId1.foo', dbi, null, true);
console.log('Direct value:');
console.log('---------------------');
console.log('MyId1.foo:', subObj2);

console.log('\nDB:');
lazyDb.printDb(dbi);

dbi.close();
env.close();
```

API
-------

### open

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

### read

`lazyDb.read(String key, Object dbi, [Object txn], [Boolean cache]) -> Proxy|*`

Read value from database directly or create proxy object by `key`. If transaction `txn` is passed, object will use it,
otherwise internal transaction(s) will be started.
When cache is true, values from DB are set to object's properties (cached). In this case reading from database is
performed once on first property access.
Returned object can be modified, but nothing will be written to database.

### write

`lazyDb.write(String key, Object dbi, [Object txn]) -> Proxy`

Create object connected to database `dbi` with unique key `key`. If transaction `txn` is passed, object will use it,
otherwise internal transaction(s) will be started.
When properties of returned object are modified, they are automatically stored in database.

### del

`lazyDb.del(String key, Object dbi, [Object txn])`

Remove value or object from DB by `key`. If transaction `txn` is passed, object will use it,
otherwise internal transaction(s) will be started.

### printDb

`lazyDb.printDb(Object dbi, [Number skip = 0], [Number limit = 100])`

Prints content of db to console.

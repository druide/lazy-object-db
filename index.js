/**
 * @module
 */
const lmdb = require('node-lmdb');
var fs = require('fs');

/**
 * Open environment
 * @param  {Object} options
 * @return {Object}
 */
function open (options) {
    var env = new lmdb.Env();
    try {
        fs.accessSync(options.path, fs.R_OK | fs.W_OK);
    } catch (e) {
        fs.mkdirSync(options.path);
    }
    env.open(options);
    return env;
}

function printFn (key, data) {
    console.log(key + ' =', data);
}

/**
 * Print db content to console
 * @param  {Object} dbi
 * @param  {Number} [skip]
 * @param  {Number} [limit]
 */
function printDb (dbi, skip, limit) {
    console.log('---------------------');
    skip = skip || 0;
    limit = limit || 100;
    var txn = dbi.env.beginTxn({readOnly: true});
    var cursor = new lmdb.Cursor(txn, dbi);
    for (var found = cursor.goToFirst(); found; found = cursor.goToNext()) {
        if (skip-- > 0) continue;
        if (limit-- <= 0) break;
        cursor.get(printFn);
    }
    cursor.close();
    txn.abort();
    console.log('---------------------');
}

/**
 * Remove key and it's subkeys from db
 * @param  {String} key
 * @param  {Object} dbi
 * @param  {Object} [txn]
 * @return {Boolean}
 */
function del (key, dbi, txn) {
    var fullKey = key;
    var txn2 = txn || dbi.env.beginTxn();
    var cursor = new lmdb.Cursor(txn2, dbi);
    var found = cursor.goToRange(fullKey);
    var stop = false;

    var _check = function (key) {
        if (key === fullKey || key.indexOf(fullKey + '.') === 0) {
            cursor.del();
        } else {
            stop = true;
        }
    };

    while (found) {
        cursor.get(_check);
        if (stop) break;
        found = cursor.goToNext();
    }

    cursor.close();
    if (!txn) txn2.commit();
    return true;
}

function NOPE () {
    throw new Error('Operation not supported');
}

/**
 * Read DB object. Returns value from db, if key present, otherwise makes proxy object for access.
 * @param {String} key
 * @param {Object} dbi
 * @param {Object} [txn] external transaction
 * @param {Boolean} cache
 * @return {Proxy|*} value or Proxy
 */
function read (key, dbi, txn, cache) {
    var txn2 = txn || dbi.env.beginTxn({readOnly: true});
    var v = txn2.get(dbi, key);
    if (!txn) txn2.abort();
    // if value is present, return it
    if (v !== null) return v;

    // otherwise create proxy
    var target = {_: {key: key, dbi: dbi}};
    if (typeof txn !== 'undefined') target._.txn = txn;
    if (typeof cache !== 'undefined') target._.cache = cache;
    if (!has(target)) return undefined;
    return new Proxy(target, readHandler);
}

var readHandler = {
    get: function (target, key, receiver) {
        if (typeof key !== 'string' || key === 'inspect' || key === 'valueOf') {
            return Reflect.get(target, key, receiver);
        }
        var v;

        // if has own property, return it without db read
        if (Reflect.has(target, key, receiver)) {
            v =  Reflect.get(target, key, receiver);
            return v === null ? undefined : v;
        }

        var fullKey = target._.key + '.' + key;
        v = read(fullKey, target._.dbi, target._.txn, target._.cache);
        if (typeof v === 'object' || target._.cache) target[key] = v;
        return v;
    },
    set: function (target, key, value, receiver) {
        if (key === '_') return false;
        var fullKey = target._.key + '.' + key;
        if (value === null || value === undefined) {
            Reflect.set(target, key, null, receiver);
        } else {
            if (typeof value === 'object') {
                var obj = target[key] = read(fullKey, target._.dbi, target._.txn, target._.cache);
                Object.keys(value).forEach(function (key) {
                    obj[key] = value[key];
                });
                return true;
            }
            Reflect.set(target, key, value, receiver);
        }
        return true;
    },
    has: has,
    ownKeys: ownKeys,
    // defineProperty: NOPE,
    deleteProperty: function (target, key) {
        target[key] = null;
    },
    preventExtensions: NOPE,
    setPrototypeOf: NOPE,
};

/**
 * Create proxy object for db writes
 * @param  {String} key
 * @param  {Object} dbi
 * @param  {Object} [txn] external transaction
 * @return {Proxy}
 */
function write (key, dbi, txn) {
    return new Proxy({_: {key: key, dbi: dbi, txn: txn}}, writeHandler);
}

var writeHandler = {
    get: function (target, key, receiver) {
        if (typeof key !== 'string' || key === 'inspect' || key === 'valueOf') {
            return Reflect.get(target, key, receiver);
        }
        var v;

        // if has own property, return it without db read
        if (Reflect.has(target, key, receiver)) {
            v =  Reflect.get(target, key, receiver);
            return v === null ? undefined : v;
        }

        var fullKey = target._.key + '.' + key;
        var dbi = target._.dbi;
        var txn = target._.txn || dbi.env.beginTxn({readOnly: true});
        v = txn.get(dbi, fullKey);
        if (!target._.txn) txn.abort();
        var isLeaf = v === null;
        if (isLeaf) {
            target[key] = write(fullKey, dbi, target._.txn);
            return Reflect.get(target, key, receiver);
        }
        //target[key] = v;
        return v;
    },
    set: function (target, key, value, receiver) {
        if (key === '_') return false;
        var fullKey = target._.key + '.' + key;

        // cleanup previous value(s) from DB
        this.deleteProperty(target, key);

        if (value !== null && value !== undefined) {
            if (typeof value === 'object') {
                var obj = target[key] = write(fullKey, target._.dbi, target._.txn);
                Object.keys(value).forEach(function (key) {
                    obj[key] = value[key];
                });
                return true;
            }
            Reflect.set(target, key, value, receiver);
        }
        var dbi = target._.dbi;
        var txn = target._.txn || dbi.env.beginTxn();
        txn.put(dbi, fullKey, value);
        if (!target._.txn) txn.commit();
        return true;
    },
    //defineProperty: NOPE,
    deleteProperty: function (target, key) {
        var fullKey = target._.key + '.' + key;
        Reflect.deleteProperty(target, key);
        var dbi = target._.dbi;
        var txn = target._.txn || dbi.env.beginTxn();
        var cursor = new lmdb.Cursor(txn, dbi);
        var found = cursor.goToRange(fullKey);
        var stop = false;

        var _check = function (key) {
            if (key === fullKey || key.indexOf(fullKey + '.') === 0) {
                cursor.del();
            } else {
                stop = true;
            }
        };

        while (found) {
            cursor.get(_check);
            if (stop) break;
            found = cursor.goToNext();
        }

        cursor.close();
        if (!target._.txn) txn.commit();
        return true;
    },
    has: has,
    ownKeys: ownKeys,
    preventExtensions: NOPE,
    setPrototypeOf: NOPE
};

function has (target, key) {
    var fullKey = key ? target._.key + '.' + key : target._.key;
    if (key === '_') return false;
    if (Reflect.has(target, key)) {
        return Reflect.get(target, key) !== null;
    }

    var dbi = target._.dbi;
    var txn = target._.txn || dbi.env.beginTxn({readOnly: true});
    var cursor = new lmdb.Cursor(txn, dbi);
    var found = cursor.goToRange(fullKey);
    var exists = false;

    if (found && (found === fullKey || found.indexOf(fullKey + '.') === 0)) {
        exists = true;
        /*if (found === fullKey) {
            cursor.get(function (key2, data) {
                target[key] = data;
            });
        }*/
    }

    cursor.close();
    if (!target._.txn) txn.abort();
    return exists;
}

function ownKeys (target) {
    var arr = Reflect.ownKeys(target);
    for (var i = 0; i < arr.length; i++) {
        var key = arr[i];
        if (key === '_' || Reflect.get(target, key) === null) {
            arr.splice(i--, 1);
        }
    }

    var fullKey = target._.key + '.';
    var dbi = target._.dbi;
    var txn = target._.txn || dbi.env.beginTxn({readOnly: true});
    var cursor = new lmdb.Cursor(txn, dbi);
    var found = cursor.goToRange(fullKey);

    var keyName;
    /*function keyGet (key2, data) {
        target[keyName] = data;
    }*/

    while (found) {
        var p = found.indexOf(fullKey);
        if (p === 0) {
            var pointP = found.indexOf('.', p + fullKey.length + 1);
            if (pointP !== -1) found = found.substring(0, pointP);

            var alreadyHas = false;
            keyName = found.substring(p + fullKey.length);
            if (Reflect.get(target, keyName) !== null) {
                for (var j = 0; j < arr.length; j++) {
                    if (arr[j] === keyName) {
                        alreadyHas = true;
                        break;
                    }
                }
                if (!alreadyHas) {
                    arr.push(keyName);
                    //cursor.get(keyGet);
                }
            }
        } else {
            break;
        }
        found = cursor.goToNext();
    }

    cursor.close();
    if (!target._.txn) txn.abort();

    return arr;
}

exports.open = open;
exports.del = del;
exports.read = read;
exports.write = write;
exports.printDb = printDb;

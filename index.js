const lmdb = require('node-lmdb');

/**
 * Open environment
 * @param  {Object} options
 * @return {Object}
 */
function open (options) {
    var env = new lmdb.Env();
    env.open(options);
    return env;
}

function printFn (key, data) {
    console.log(key + ' =', data);
}

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

function del (target) {
    var _ = Reflect.get(target, '_');
    var fullKey = _.key;
    var dbi = _.dbi;
    var txn = _.txn || dbi.env.beginTxn();
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
    if (!_.txn) txn.commit();
    return true;
}

function NOPE () {
    throw new Error('Operation not supported');
}

function LazyDbRead (key, dbi, txn) {
    return new Proxy({_: {key: key, dbi: dbi, txn: txn}}, lazyDbReadHandler);
}

var lazyDbReadHandler = {
    get: function (target, key, receiver) {
        if (typeof key !== 'string' || key === 'inspect' || key === 'valueOf') {
            return Reflect.get(target, key, receiver);
        }
        var v;
        if (Reflect.has(target, key, receiver)) {
            v =  Reflect.get(target, key, receiver);
            return v === null ? undefined : v;
        }

        var fullKey = target._.key + '.' + key;
        var dbi = target._.dbi;
        var txn = target._.txn || dbi.env.beginTxn({readOnly: true});
        v = txn.get(dbi, fullKey);
        if (!target._.txn) txn.abort();
        var isLeaf = v === null && has(target, key);
        if (isLeaf) {
            target[key] = LazyDbRead(fullKey, dbi, target._.txn);
            return Reflect.get(target, key, receiver);
        }
        target[key] = v;
        return v;
    },
    set: function (target, key, value, receiver) {
        if (key === '_') return false;
        var fullKey = target._.key + '.' + key;
        if (value === null || value === undefined) {
            Reflect.set(target, key, null, receiver);
        } else {
            if (typeof value === 'object') {
                var obj = target[key] = LazyDbRead(fullKey, target._.dbi, target._.txn);
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

function LazyDbWrite (key, dbi, txn) {
    return new Proxy({_: {key: key, dbi: dbi, txn: txn}}, lazyDbWriteHandler);
}

var lazyDbWriteHandler = {
    get: function (target, key, receiver) {
        if (typeof key !== 'string' || key === 'inspect' || key === 'valueOf') {
            return Reflect.get(target, key, receiver);
        }
        var v;
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
            target[key] = LazyDbWrite(fullKey, dbi, target._.txn);
            return Reflect.get(target, key, receiver);
        }
        target[key] = v;
        return v;
    },
    set: function (target, key, value, receiver) {
        if (key === '_') return false;
        var fullKey = target._.key + '.' + key;
        this.deleteProperty(target, key);
        if (value === null || value === undefined) {
            //Reflect.deleteProperty(target, key, receiver);
        } else {
            if (typeof value === 'object') {
                var obj = target[key] = LazyDbWrite(fullKey, target._.dbi, target._.txn);
                Object.keys(value).forEach(function (key) {
                    obj[key] = value[key];
                });
                return true;
            }
            Reflect.set(target, key, value, receiver);
        }
        var dbi = target._.dbi;
        var txn = target._.txn || dbi.env.beginTxn();
        // if (txn.get(dbi, target._.key) !== LEAF_SIGNATURE) txn.put(target._.dbi, target._.key, LEAF_SIGNATURE);
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
    var fullKey = target._.key + '.' + key;
    if (key === '_') return false;
    if (Reflect.has(target, key)) {
        return Reflect.get(target, key) !== null;
    }

    var dbi = target._.dbi;
    var txn = target._.txn || dbi.env.beginTxn({readOnly: true});
    var cursor = new lmdb.Cursor(txn, dbi);
    var found = cursor.goToRange(fullKey);
    var has = false;

    if (found && (found === fullKey || found.indexOf(fullKey + '.') === 0)) {
        has = true;
        /*if (found === fullKey) {
            cursor.get(function (key2, data) {
                target[key] = data;
            });
        }*/
    }

    cursor.close();
    if (!target._.txn) txn.abort();
    return has;
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
exports.Read = LazyDbRead;
exports.Write = LazyDbWrite;
exports.printDb = printDb;

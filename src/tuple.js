// Although `Symbol` is widely supported these days, we can safely fall
// back to using a non-enumerable string property without violating any
// assumptions elsewhere in the implementation.
const useSymbol =
  typeof Symbol === "function" &&
  typeof Symbol.for === "function";

// Used to mark `tuple.prototype` so that all objects that inherit from
// any `tuple.prototype` object (there could be more than one) will test
// positive according to `tuple.isTuple`.
export const brand = useSymbol
  ? Symbol.for("immutable-tuple")
  : "@@__IMMUTABLE_TUPLE__@@";

// Used to save a reference to the globally shared `UniversalWeakMap` that
// stores all known `tuple` objects.
export const globalKey = useSymbol
  ? Symbol.for("immutable-tuple-root")
  : "@@__IMMUTABLE_TUPLE_ROOT__@@";

// Convenient helper for defining hidden immutable properties.
export function def(obj, name, value, enumerable) {
  Object.defineProperty(obj, name, {
    value: value,
    enumerable: !! enumerable,
    writable: false,
    configurable: false
  });
  return value;
}

export const freeze = Object.freeze || function (obj) {
  return obj;
};

export function isObjRef(value) {
  switch (typeof value) {
  case "object":
    if (value === null) {
      return false;
    }
  case "function":
    return true;
  default:
    return false;
  }
}

// The `mustConvertThisToArray` value is true when the corresponding
// `Array` method does not attempt to modify `this`, which means we can
// pass a `tuple` object as `this` without first converting it to an
// `Array`.
export function forEachArrayMethod(fn) {
  function call(name, mustConvertThisToArray) {
    const desc = Object.getOwnPropertyDescriptor(Array.prototype, name);
    fn(name, desc, !! mustConvertThisToArray);
  }

  call("every");
  call("filter");
  call("find");
  call("findIndex");
  call("forEach");
  call("includes");
  call("indexOf");
  call("join");
  call("lastIndexOf");
  call("map");
  call("reduce");
  call("reduceRight");
  call("slice");
  call("some");
  call("toLocaleString");
  call("toString");

  // The `reverse` and `sort` methods are usually destructive, but for
  // `tuple` objects they return a new `tuple` object that has been
  // appropriately reversed/sorted.
  call("reverse", true);
  call("sort", true);

  // Make `[...someTuple]` work.
  call(useSymbol && Symbol.iterator || "@@iterator");
}

// A map data structure that holds object keys weakly, yet can also hold
// non-object keys, unlike the native `WeakMap`.
export class UniversalWeakMap {
  constructor() {
    // Since a `WeakMap` cannot hold primitive values as keys, we need a
    // backup `Map` instance to hold primitive keys. Both `this._weakMap`
    // and `this._strongMap` are lazily initialized.
    this._weakMap = null;
    this._strongMap = null;
    this.data = null;
  }

  // Since `get` and `set` are the only methods used, that's all I've
  // implemented here.

  get(key) {
    const map = this._getMap(key, false);
    if (map) {
      return map.get(key);
    }
  }

  set(key, value) {
    this._getMap(key, true).set(key, value);
    // An actual `Map` or `WeakMap` would return `this` here, but
    // returning the `value` is more convenient for the `tuple`
    // implementation.
    return value;
  }

  _getMap(key, canCreate) {
    if (! canCreate) {
      return isObjRef(key) ? this._weakMap : this._strongMap;
    }
    if (isObjRef(key)) {
      return this._weakMap || (this._weakMap = new WeakMap);
    }
    return this._strongMap || (this._strongMap = new Map);
  }
}

// If this package is installed multiple times, there could be mutiple
// implementations of the `tuple` function with distinct `tuple.prototype`
// objects, but the shared pool of `tuple` objects must be the same across
// all implementations. While it would be ideal to use the `global`
// object, there's no reliable way to get the global object across all JS
// environments without using the `Function` constructor, so instead we
// use the global `Array` constructor as a shared namespace.
const root = Array[globalKey] || def(Array, globalKey, new UniversalWeakMap, false);

export function lookup() {
  return lookupArray(arguments);
}

export function lookupArray(array) {
  let node = root;

  // Because we are building a tree of *weak* maps, the tree will not
  // prevent objects in tuples from being garbage collected, since the
  // tree itself will be pruned over time when the corresponding `tuple`
  // objects become unreachable. In addition to internalization, this
  // property is a key advantage of the `immutable-tuple` package.
  const len = array.length;
  for (let i = 0; i < len; ++i) {
    const item = array[i];
    node = node.get(item) || node.set(item, new UniversalWeakMap);
  }

  // Return node.data rather than node itself to prevent tampering with
  // the UniversalWeakMap tree.
  return node.data || (node.data = Object.create(null));
}

  // When called with any number of arguments, this function returns an
  // object that inherits from `tuple.prototype` and is guaranteed to be
  // `===` any other `tuple` object that has exactly the same items. In
  // computer science jargon, `tuple` instances are "internalized" or just
  // "interned," which allows for constant-time equality checking, and makes
  // it possible for tuple objects to be used as `Map` or `WeakMap` keys, or
  // stored in a `Set`.
  export default function tuple() {
    const node = lookup.apply(null, arguments);
  
    if (node.tuple) {
      return node.tuple;
    }
  
    const t = Object.create(tuple.prototype);
  
    // Define immutable items with numeric indexes, and permanently fix the
    // `.length` property.
    const argc = arguments.length;
    for (let i = 0; i < argc; ++i) {
      t[i] = arguments[i];
    }
  
    def(t, "length", argc, false);
  
    // Remember this new `tuple` object so that we can return the same object
    // earlier next time.
    return freeze(node.tuple = t);
  }
  
  // Named imports work as well as `default` imports.
  export { tuple };
  
  // Since the `immutable-tuple` package could be installed multiple times
  // in an application, there is no guarantee that the `tuple` constructor
  // or `tuple.prototype` will be unique, so `value instanceof tuple` is
  // unreliable. Instead, to test if a value is a tuple, you should use
  // `tuple.isTuple(value)`.
  def(tuple.prototype, brand, true, false);
  function isTuple(that) {
    return !! (that && that[brand] === true);
  }
  
  tuple.isTuple = isTuple;
  
  function toArray(tuple) {
    const array = [];
    let i = tuple.length;
    while (i--) array[i] = tuple[i];
    return array;
  }
  
  // Copy all generic non-destructive Array methods to `tuple.prototype`.
  // This works because (for example) `Array.prototype.slice` can be invoked
  // against any `Array`-like object.
  forEachArrayMethod((name, desc, mustConvertThisToArray) => {
    const method = desc && desc.value;
    if (typeof method === "function") {
      desc.value = function (...args) {
        const result = method.apply(
          mustConvertThisToArray ? toArray(this) : this,
          args
        );
        // Of course, `tuple.prototype.slice` should return a `tuple` object,
        // not a new `Array`.
        return Array.isArray(result) ? tuple(...result) : result;
      };
      Object.defineProperty(tuple.prototype, name, desc);
    }
  });
  
  // Like `Array.prototype.concat`, except for the extra effort required to
  // convert any tuple arguments to arrays, so that
  // ```
  // tuple(1).concat(tuple(2), 3) === tuple(1, 2, 3)
  // ```
  const { concat } = Array.prototype;
  tuple.prototype.concat = function (...args) {
    return tuple(...concat.apply(toArray(this), args.map(
      item => isTuple(item) ? toArray(item) : item
    )));
  };
  


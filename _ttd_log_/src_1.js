﻿// Copyright Microsoft. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and / or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

/* eslint-disable strict */
(function(keepAlive) {
  // Save original builtIns
  const Function_prototype_toString = Function.prototype.toString;
  const Object_defineProperty = Object.defineProperty;
  const Object_getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const Object_getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
  const Object_getOwnPropertyNames = Object.getOwnPropertyNames;
  const Object_keys = Object.keys;
  const Object_prototype_toString = Object.prototype.toString;
  const Object_setPrototypeOf = Object.setPrototypeOf;
  const Reflect_apply = Reflect.apply;
  const Reflect_construct = Reflect.construct;
  const Symbol_keyFor = Symbol.keyFor;
  const Symbol_for = Symbol.for;
  const Global_ParseInt = parseInt;
  const JSON_parse = JSON.parse;
  const JSON_stringify = JSON.stringify;
  const BuiltInError = Error;
  const global = this;

  // TODO: Remove this shim when BigUint64Array is supported in chakra
  Object_defineProperty(global, 'BigUint64Array',
                        {
                          value: Uint32Array,
                          configurable: true,
                          writable: true,
                          enumerable: false
                        });

  // Simulate V8 JavaScript stack trace API
  function StackFrame(func, funcName, fileName, lineNumber, columnNumber) {
    this.column = columnNumber;
    this.lineNumber = lineNumber;
    this.scriptName = fileName;
    this.functionName = funcName;
    this.function = func;
  }

  StackFrame.prototype.getFunction = function() {
    // TODO: Fix if .stack is called from different callsite
    // from where Error() or Error.captureStackTrace was called
    return this.function;
  };

  StackFrame.prototype.getTypeName = function() {
    // TODO : Fix this
    return this.functionName;
  };

  StackFrame.prototype.getMethodName = function() {
    return this.functionName;
  };

  StackFrame.prototype.getFunctionName = function() {
    return this.functionName;
  };

  StackFrame.prototype.getFileName = function() {
    return this.scriptName;
  };

  StackFrame.prototype.getLineNumber = function() {
    return this.lineNumber;
  };

  StackFrame.prototype.getColumnNumber = function() {
    return this.column;
  };

  StackFrame.prototype.isEval = function() {
    // TODO
    return false;
  };

  StackFrame.prototype.isToplevel = function() {
    // TODO
    return false;
  };

  StackFrame.prototype.isNative = function() {
    // TODO
    return false;
  };

  StackFrame.prototype.isConstructor = function() {
    // TODO
    return false;
  };

  StackFrame.prototype.toString = function() {
    return (this.functionName || 'Anonymous function') + ' (' +
      this.scriptName + ':' + this.lineNumber + ':' + this.column + ')';
  };

  // default StackTrace stringify function
  function prepareStackTrace(error, stack) {
    let stackString = (error.name || 'Error') + ': ' + (error.message || '');

    for (var i = 0; i < stack.length; i++) {
      stackString += '\n   at ' + stack[i].toString();
    }

    return stackString;
  }

  // Parse 'stack' string into StackTrace frames. Skip top 'skipDepth' frames,
  // and optionally skip top to 'startName' function frames.
  function parseStack(stack, skipDepth, startName) {
    const stackSplitter = /\)\s*at/;
    const reStackDetails = /\s(?:at\s)?(.*)\s\((.*)/;
    const fileDetailsSplitter = /:(\d+)/;

    let curr = parseStack;
    const splittedStack = stack.split(stackSplitter);
    const errstack = [];

    for (var i = 0; i < splittedStack.length; i++) {
      // parseStack has 1 frame lesser than skipDepth. So skip calling .caller
      // once. After that, continue calling .caller
      if (skipDepth !== 1 && curr) {
        try {
          curr = curr.caller;
        } catch (e) {
          curr = undefined;  // .caller might not be allowed in curr's context
        }
      }

      if (skipDepth-- > 0) {
        continue;
      }

      const func = curr;
      const stackDetails = reStackDetails.exec(splittedStack[i]);
      let funcName = stackDetails[1];

      if (startName) {
        if (funcName === startName) {
          startName = undefined;
        }
        continue;
      }
      if (funcName === 'Anonymous function') {
        funcName = null;
      }

      const fileDetails = stackDetails[2].split(fileDetailsSplitter);

      const fileName = fileDetails[0];
      const lineNumber = fileDetails[1] ? parseInt(fileDetails[1]) : 0;
      const columnNumber = fileDetails[3] ? parseInt(fileDetails[3]) : 0;

      errstack.push(new StackFrame(func, funcName, fileName, lineNumber,
                                   columnNumber));
    }

    return errstack;
  }

  function findFuncDepth(func) {
    if (!func) {
      return 0;
    }

    try {
      let curr = privateCaptureStackTrace.caller;
      const limit = Error.stackTraceLimit;
      let skipDepth = 0;
      while (curr) {
        skipDepth++;
        if (curr === func) {
          return skipDepth;
        }
        if (skipDepth > limit) {
          return 0;
        }
        curr = curr.caller;
      }
    } catch (e) {
      // Strict mode may throw on .caller. Will try to match by function name.
      return -1;
    }

    return 0;
  }

  function withStackTraceLimitOffset(offset, f) {
    const oldLimit = BuiltInError.stackTraceLimit;
    if (typeof oldLimit === 'number') {
      BuiltInError.stackTraceLimit = oldLimit + offset;
    }

    try {
      return f();
    } finally {
      BuiltInError.stackTraceLimit = oldLimit;
    }
  }

  function captureStackTrace(err, func) {
    // skip 3 frames: lambda, withStackTraceLimitOffset, this frame
    return privateCaptureStackTrace(
      err, func,
      withStackTraceLimitOffset(3, () => new BuiltInError()),
      3);
  }

  // private captureStackTrace implementation
  //  err, func -- args from Error.captureStackTrace
  //  e -- a new Error object which already captured stack
  //  skipDepth -- known number of top frames to be skipped
  function privateCaptureStackTrace(err, func, e, skipDepth) {
    let currentStack = e;
    let isPrepared = false;
    const oldStackDesc = Object_getOwnPropertyDescriptor(e, 'stack');

    const funcSkipDepth = findFuncDepth(func);
    const startFuncName = (func && funcSkipDepth < 0) ? func.name : undefined;
    skipDepth += Math.max(funcSkipDepth - 1, 0);

    let currentStackTrace;
    function ensureStackTrace() {
      if (!currentStackTrace) {
        currentStackTrace = parseStack(
          Reflect_apply(oldStackDesc.get, e, []) || '', // Call saved old getter
          skipDepth, startFuncName);
      }

      return currentStackTrace;
    }

    function stackGetter() {
      if (!isPrepared) {
        const prep = Error.prepareStackTrace || prepareStackTrace;

        // Prep can be re-entrant, of sorts, with regards to setting err.stack
        // vs returning what err.stack should be.
        // We are trying to emulate the following behavior:
        // * Error.prepareStackTrace = function (err, frames)
        //   { err.stack = 1 } -> err.stack should be 1
        // * Error.prepareStackTrace = function (err, frames)
        //   { console.log("Called prepare") } -> err.stack should be undefined
        // * Error.prepareStackTrace = function (err, frames)
        //   { return 2 } -> err.stack should be 2
        // * Error.prepareStackTrace = function (err, frames)
        //   { err.stack = 1; return 2; } -> err.stack should be *1*
        const preparedStack = prep(err, ensureStackTrace());
        if (!isPrepared) {
          stackSetter(preparedStack);
        }
      }

      return currentStack;
    }

    function stackSetter(value) {
      currentStack = value;
      isPrepared = true;
      // Notify original Error object of this setter call. Without knowing
      // this Chakra runtime would reset stack at throw time.
      Reflect_apply(oldStackDesc.set, e, [value]);
    }

    // To retain overriden stackAccessors below,notify Chakra runtime to not
    // reset stack for this error object.
    if (e !== err) {
      Reflect_apply(oldStackDesc.set, err, ['']);
    }

    Object_defineProperty(err, 'stack', {
      get: stackGetter, set: stackSetter, configurable: true, enumerable: false
    });

    return ensureStackTrace; // For chakrashim native to get stack frames
  }

  // patch Error types to hook with Error.captureStackTrace/prepareStackTrace
  function patchErrorTypes() {
    // save a map from wrapper to builtin native types
    const typeToNative = new Map();

    // patch all these builtin Error types
    [
      Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError,
      URIError
    ].forEach(function(type) {
      function newType() {
        const e = withStackTraceLimitOffset(
          3, () => Reflect_construct(type, arguments, new.target || newType));
        // skip 3 frames: lambda, withStackTraceLimitOffset, this frame
        privateCaptureStackTrace(e, undefined, e, 3);
        return e;
      }

      Object_defineProperty(newType, 'name', {
        value: type.name,
        writable: false, enumerable: false, configurable: true
      });
      newType.prototype = type.prototype;
      newType.prototype.constructor = newType;
      if (type !== BuiltInError) {
        Object_setPrototypeOf(newType, Error);
      }
      global[type.name] = newType;
      typeToNative.set(newType, type);
    });

    // Delegate Error.stackTraceLimit to builtin Error constructor
    Object_defineProperty(Error, 'stackTraceLimit', {
      enumerable: false,
      configurable: true,
      get: function() { return BuiltInError.stackTraceLimit; },
      set: function(value) { BuiltInError.stackTraceLimit = value; }
    });

    Function.prototype.toString = function toString() {
      return Reflect_apply(Function_prototype_toString,
                           typeToNative.get(this) || this, arguments);
    };
    typeToNative.set(Function.prototype.toString, Function_prototype_toString);
  }

  function patchErrorStack() {
    Error.captureStackTrace = captureStackTrace;
  }

  // Ensure global Debug object if not already exists, and patch it.
  function ensureDebug(otherGlobal) {
    if (!global.Debug) {
      Object_defineProperty(global, 'Debug', {
        value: {}, enumerable: false, configurable: false, writable: false
      });
    }

    otherProcess = otherGlobal.process;
    patchDebug(global.Debug);
  }

  let otherProcess;

  function patchDebug(Debug) {
    if (!Debug || Debug.MakeMirror) {
      return;
    }

    class Mirror {
      constructor(type) {
        this.type_ = type;
      }
      type() {
        return this.type_;
      }
    }

    class ValueMirror extends Mirror {
      constructor(type, value) {
        super(type);
        this.value_ = value;
      }
      value() {
        return this.value_;
      }
    }

    class UndefinedMirror extends ValueMirror {
      constructor() {
        super('undefined', undefined);
      }
    }
    const undefinedMirror = new UndefinedMirror();

    class ObjectMirror extends ValueMirror {
      constructor(type, value) {
        super(type || 'object', value);
      }
    }

    class PromiseMirror extends ObjectMirror {
      constructor(value) {
        super('promise', value);
      }
      status() {
        return '<unknown>';
      }
      promiseValue() {
        return new ValueMirror('<unknown>', '<unknown>');
      }
    }

    const util = otherProcess.binding('util');

    Debug.MakeMirror = (value) => {
      if (util.isPromise(value)) {
        return new PromiseMirror(value);
      }

      // Not supporting other types
      return undefinedMirror;
    };
  }

  function patchUtils(utils) {
    const isUintRegex = /^(0|[1-9]\d*)$/;

    function isUint(value) {
      const result = isUintRegex.test(value);
      isUintRegex.lastIndex = 0;
      return result;
    }

    utils.cloneObject = function(source, target) {
      Object_getOwnPropertyNames(source).forEach(function(key) {
        try {
          const desc = Object_getOwnPropertyDescriptor(source, key);
          if (desc.value === source) desc.value = target;
          Object_defineProperty(target, key, desc);
        } catch (e) {
          // Catch sealed properties errors
        }
      });
    };

    utils.getPropertyNames = function(a) {
      const names = [];
      for (const propertyName in a) {
        if (isUint(propertyName)) {
          names.push(Global_ParseInt(propertyName));
        } else {
          names.push(propertyName);
        }
      }

      return names;
    };

    utils.getEnumerableNamedProperties = function(obj) {
      const props = [];
      for (const key in obj) {
        if (!isUint(key))
          props.push(key);
      }

      return props;
    };

    utils.getEnumerableIndexedProperties = function(obj) {
      const props = [];
      for (const key in obj) {
        if (isUint(key))
          props.push(key);
      }

      return props;
    };

    utils.createEnumerationIterator = function(props) {
      let i = 0;
      return {
        next: function() {
          if (i === props.length) return { done: true };
          return { value: props[i++] };
        }
      };
    };

    utils.createPropertyDescriptorsEnumerationIterator = function(props) {
      let i = 0;
      return {
        next: function() {
          if (i === props.length) return { done: true };
          return { name: props[i++], enumerable: true };
        }
      };
    };

    utils.getNamedOwnKeys = function(obj) {
      const props = [];
      Object_keys(obj).forEach(function(item) {
        if (!isUint(item))
          props.push(item);
      });

      return props;
    };

    utils.getIndexedOwnKeys = function(obj) {
      const props = [];
      Object_keys(obj).forEach(function(item) {
        if (isUint(item))
          props.push(item);
      });

      return props;
    };

    utils.getStackTrace = function() {
      return captureStackTrace({}, undefined)();
    };

    function compareType(o, expectedType) {
      return Object_prototype_toString.call(o) === '[object ' +
            expectedType + ']';
    }

    utils.isMapIterator = function(obj) {
      return compareType(obj, 'Map Iterator');
    };

    utils.isSetIterator = function(obj) {
      return compareType(obj, 'Set Iterator');
    };

    utils.isBooleanObject = function(obj) {
      return compareType(obj, 'Boolean');
    };

    utils.isDate = function(obj) {
      return compareType(obj, 'Date');
    };

    utils.isMap = function(obj) {
      return compareType(obj, 'Map');
    };

    utils.isNativeError = function(obj) {
      return compareType(obj, 'Error') ||
        obj instanceof Error ||
        obj instanceof EvalError ||
        obj instanceof RangeError ||
        obj instanceof ReferenceError ||
        obj instanceof SyntaxError ||
        obj instanceof TypeError ||
        obj instanceof URIError;
    };

    utils.isPromise = function(obj) {
      // This won't correctly detect Promise objects from other contexts.
      return compareType(obj, 'Promise') && obj instanceof Promise;
    };

    utils.isRegExp = function(obj) {
      return compareType(obj, 'RegExp');
    };

    utils.isAsyncFunction = function(obj) {
      return compareType(obj, 'AsyncFunction');
    };

    utils.isSet = function(obj) {
      return compareType(obj, 'Set');
    };

    utils.isStringObject = function(obj) {
      return compareType(obj, 'String');
    };

    utils.isNumberObject = function(obj) {
      return compareType(obj, 'Number');
    };

    utils.isArgumentsObject = function(obj) {
      return compareType(obj, 'Arguments');
    };

    utils.isGeneratorObject = function(obj) {
      return compareType(obj, 'Generator');
    };

    utils.isGeneratorFunction = function(obj) {
      return compareType(obj, 'GeneratorFunction');
    };

    utils.isWebAssemblyCompiledModule = function(obj) {
      return compareType(obj, 'WebAssembly.Module');
    };

    utils.isWeakMap = function(obj) {
      return compareType(obj, 'WeakMap');
    };

    utils.isWeakSet = function(obj) {
      return compareType(obj, 'WeakSet');
    };

    utils.isSymbolObject = function(obj) {
      return compareType(obj, 'Symbol');
    };

    utils.isName = function(obj) {
      return compareType(obj, 'String') || compareType(obj, 'Symbol');
    };

    utils.isSharedArrayBuffer = function(obj) {
      return compareType(obj, 'SharedArrayBuffer');
    };

    utils.isModuleNamespaceObject = function(obj) {
      return compareType(obj, 'Module');
    };

    utils.getSymbolKeyFor = function(symbol) {
      return Symbol_keyFor(symbol);
    };

    utils.getSymbolFor = function(key) {
      return Symbol_for(key);
    };

    utils.jsonParse = function(text, reviver) {
      return JSON_parse(text, reviver);
    };

    utils.jsonStringify = function(value, replacer, space) {
      return JSON_stringify(value, replacer, space);
    };

    utils.ensureDebug = ensureDebug;

    utils.getPropertyAttributes = function(object, value) {
      const descriptor = Object_getOwnPropertyDescriptor(object, value);
      if (descriptor === undefined) {
        return -1;
      }

      let attributes = 0;
      // taken from v8.h. Update if this changes in future
      const ReadOnly = 1;
      const DontEnum = 2;
      const DontDelete = 4;

      if (!descriptor.writable) {
        attributes |= ReadOnly;
      }

      if (!descriptor.enumerable) {
        attributes |= DontEnum;
      }

      if (!descriptor.configurable) {
        attributes |= DontDelete;
      }

      return attributes;
    };

    utils.getOwnPropertyNames = function(obj) {
      const ownPropertyNames = Object_getOwnPropertyNames(obj);
      let i = 0;
      while (i < ownPropertyNames.length) {
        const item = ownPropertyNames[i];
        if (isUint(item)) {
          ownPropertyNames[i] = Global_ParseInt(item);
          i++;
          continue;
        }

        // As per spec, getOwnPropertyNames() first include
        // numeric properties followed by non-numeric
        break;
      }

      return ownPropertyNames;
    };

    utils.beforeContext = function(contextGlobal) {
      return Object_getOwnPropertyDescriptors(contextGlobal);
    };

    function descriptorDiff(a, b) {
      if (!a || !b) {
        return true;
      }

      // eslint-disable-next-line no-self-compare
      if (a.value !== b.value && a.value === a.value && b.value === b.value) {
        // allow for NaN in value
        return true;
      }
      if (a.enumerable !== b.enumerable ||
          a.configurable !== b.configurable ||
          a.writable !== b.writable) {
        return true;
      }
      if (a.get !== b.get || a.set !== b.set) {
        return true;
      }
      return false;
    }
    utils.afterContext = function(beforeDescriptors, contextGlobal, sandbox) {
      try {
        const afterDescriptors =
            Object_getOwnPropertyDescriptors(contextGlobal);
        const beforeKeys = Object_keys(beforeDescriptors);
        const afterKeys = Object_keys(afterDescriptors);

        for (const beforeKey of beforeKeys) {
          const beforeDescriptor = beforeDescriptors[beforeKey];
          const afterDescriptor = afterDescriptors[beforeKey];
          const sandboxDescriptor =
              Object_getOwnPropertyDescriptor(sandbox, beforeKey);
          if (!afterDescriptor) {
            // The descriptor was removed
            if (sandboxDescriptor) {
              if (sandboxDescriptor.configurable) {
                delete sandbox[beforeKey];
              } else {
                // TODO: How to handle this?
              }
            }
          } else if (descriptorDiff(beforeDescriptor, afterDescriptor)) {
            // Before and after differ; apply an update if possible
            if (!sandboxDescriptor || sandboxDescriptor.configurable) {
              Object_defineProperty(sandbox, beforeKey, afterDescriptor);
            } else {
              // TODO: How can we handle this case? Node tries to avoid it, but
              //       we don't always
            }
          }
        }

        for (const afterKey of afterKeys) {
          if (afterKey in beforeDescriptors) {
            continue; // Handled above
          }

          // This property is freshly added
          const afterDescriptor = afterDescriptors[afterKey];
          const sandboxDescriptor =
              Object_getOwnPropertyDescriptor(sandbox, afterKey);
          if (!sandboxDescriptor || sandboxDescriptor.configurable) {
            Object_defineProperty(sandbox, afterKey, afterDescriptor);
          } else {
            // TODO: How can we handle this?
          }
        }
      } catch (e) {
        // ignored;
      }
    };
  }

  patchErrorTypes();
  patchErrorStack();

  patchUtils(keepAlive);
});

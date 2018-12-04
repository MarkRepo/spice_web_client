var Module;
if (!Module) Module = (typeof Module !== "undefined" ? Module : null) || {};
var moduleOverrides = {};
for (var key in Module) {
	if (Module.hasOwnProperty(key)) {
		moduleOverrides[key] = Module[key]
	}
}
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_WEB = typeof window === "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
//console.log(ENVIRONMENT_IS_NODE);
if (ENVIRONMENT_IS_SHELL) {
	if (!Module["print"]) Module["print"] = print;
	if (typeof printErr != "undefined") Module["printErr"] = printErr;
	if (typeof read != "undefined") {
		Module["read"] = read
	} else {
		Module["read"] = function read() {
			throw "no read() available (jsc?)"
		}
	}
	Module["readBinary"] = function readBinary(f) {
		if (typeof readbuffer === "function") {
			return new Uint8Array(readbuffer(f))
		}
		var data = read(f, "binary");
		assert(typeof data === "object");
		return data
	};
	if (typeof scriptArgs != "undefined") {
		Module["arguments"] = scriptArgs
	} else if (typeof arguments != "undefined") {
		Module["arguments"] = arguments
	}
	this["Module"] = Module
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
	Module["read"] = function read(url) {
		var xhr = new XMLHttpRequest;
		xhr.open("GET", url, false);
		xhr.send(null);
		return xhr.responseText
	};
	if (typeof arguments != "undefined") {
		Module["arguments"] = arguments
	}
	if (typeof console !== "undefined") {
		if (!Module["print"]) Module["print"] = function print(x) {
			//console.log(x)
		};
		if (!Module["printErr"]) Module["printErr"] = function printErr(x) {
			//console.log(x)
		}
	} else {
		var TRY_USE_DUMP = false;
		if (!Module["print"]) Module["print"] = TRY_USE_DUMP && typeof dump !== "undefined" ? (function(x) {
			dump(x)
		}) : (function(x) {})
	}
	if (ENVIRONMENT_IS_WEB) {
		window["Module"] = Module
	} else {
		Module["load"] = importScripts
	}
} else {
	throw "Unknown runtime environment. Where are we?"
}
function globalEval(x) {
	eval.call(null, x)
}
if (!Module["load"] && Module["read"]) {
	Module["load"] = function load(f) {
		globalEval(Module["read"](f))
	}
}
if (!Module["print"]) {
	Module["print"] = (function() {})
}
if (!Module["printErr"]) {
	Module["printErr"] = Module["print"]
}
if (!Module["arguments"]) {
	Module["arguments"] = []
}
if (!Module["thisProgram"]) {
	Module["thisProgram"] = "./this.program"
}
Module.print = Module["print"];
Module.printErr = Module["printErr"];
Module["preRun"] = [];
Module["postRun"] = [];
for (var key in moduleOverrides) {
	if (moduleOverrides.hasOwnProperty(key)) {
		Module[key] = moduleOverrides[key]
	}
}
var Runtime = {
	setTempRet0: (function(value) {
		tempRet0 = value
	}),
	getTempRet0: (function() {
		return tempRet0
	}),
	stackSave: (function() {
		return STACKTOP
	}),
	stackRestore: (function(stackTop) {
		STACKTOP = stackTop
	}),
	getNativeTypeSize: (function(type) {
		switch (type) {
		case "i1":
		case "i8":
			return 1;
		case "i16":
			return 2;
		case "i32":
			return 4;
		case "i64":
			return 8;
		case "float":
			return 4;
		case "double":
			return 8;
		default:
			{
				if (type[type.length - 1] === "*") {
					return Runtime.QUANTUM_SIZE
				} else if (type[0] === "i") {
					var bits = parseInt(type.substr(1));
					assert(bits % 8 === 0);
					return bits / 8
				} else {
					return 0
				}
			}
		}
	}),
	getNativeFieldSize: (function(type) {
		return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE)
	}),
	STACK_ALIGN: 16,
	getAlignSize: (function(type, size, vararg) {
		if (!vararg && (type == "i64" || type == "double")) return 8;
		if (!type) return Math.min(size, 8);
		return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE)
	}),
	dynCall: (function(sig, ptr, args) {
		if (args && args.length) {
			if (!args.splice) args = Array.prototype.slice.call(args);
			args.splice(0, 0, ptr);
			return Module["dynCall_" + sig].apply(null, args)
		} else {
			return Module["dynCall_" + sig].call(null, ptr)
		}
	}),
	functionPointers: [],
	addFunction: (function(func) {
		for (var i = 0; i < Runtime.functionPointers.length; i++) {
			if (!Runtime.functionPointers[i]) {
				Runtime.functionPointers[i] = func;
				return 2 * (1 + i)
			}
		}
		throw "Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS."
	}),
	removeFunction: (function(index) {
		Runtime.functionPointers[(index - 2) / 2] = null
	}),
	getAsmConst: (function(code, numArgs) {
		if (!Runtime.asmConstCache) Runtime.asmConstCache = {};
		var func = Runtime.asmConstCache[code];
		if (func) return func;
		var args = [];
		for (var i = 0; i < numArgs; i++) {
			args.push(String.fromCharCode(36) + i)
		}
		var source = Pointer_stringify(code);
		if (source[0] === '"') {
			if (source.indexOf('"', 1) === source.length - 1) {
				source = source.substr(1, source.length - 2)
			} else {
				abort("invalid EM_ASM input |" + source + "|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)")
			}
		}
		try {
			var evalled = eval("(function(Module, FS) { return function(" + args.join(",") + "){ " + source + " } })")(Module, typeof FS !== "undefined" ? FS : null)
		} catch (e) {
			Module.printErr("error in executing inline EM_ASM code: " + e + " on: \n\n" + source + "\n\nwith args |" + args + "| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)");
			throw e
		}
		return Runtime.asmConstCache[code] = evalled
	}),
	warnOnce: (function(text) {
		if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
		if (!Runtime.warnOnce.shown[text]) {
			Runtime.warnOnce.shown[text] = 1;
			Module.printErr(text)
		}
	}),
	funcWrappers: {},
	getFuncWrapper: (function(func, sig) {
		assert(sig);
		if (!Runtime.funcWrappers[sig]) {
			Runtime.funcWrappers[sig] = {}
		}
		var sigCache = Runtime.funcWrappers[sig];
		if (!sigCache[func]) {
			sigCache[func] = function dynCall_wrapper() {
				return Runtime.dynCall(sig, func, arguments)
			}
		}
		return sigCache[func]
	}),
	UTF8Processor: (function() {
		var buffer = [];
		var needed = 0;
		this.processCChar = (function(code) {
			code = code & 255;
			if (buffer.length == 0) {
				if ((code & 128) == 0) {
					return String.fromCharCode(code)
				}
				buffer.push(code);
				if ((code & 224) == 192) {
					needed = 1
				} else if ((code & 240) == 224) {
					needed = 2
				} else {
					needed = 3
				}
				return ""
			}
			if (needed) {
				buffer.push(code);
				needed--;
				if (needed > 0) return ""
			}
			var c1 = buffer[0];
			var c2 = buffer[1];
			var c3 = buffer[2];
			var c4 = buffer[3];
			var ret;
			if (buffer.length == 2) {
				ret = String.fromCharCode((c1 & 31) << 6 | c2 & 63)
			} else if (buffer.length == 3) {
				ret = String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63)
			} else {
				var codePoint = (c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63;
				ret = String.fromCharCode(((codePoint - 65536) / 1024 | 0) + 55296, (codePoint - 65536) % 1024 + 56320)
			}
			buffer.length = 0;
			return ret
		});
		this.processJSString = function processJSString(string) {
			string = unescape(encodeURIComponent(string));
			var ret = [];
			for (var i = 0; i < string.length; i++) {
				ret.push(string.charCodeAt(i))
			}
			return ret
		}
	}),
	getCompilerSetting: (function(name) {
		throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work"
	}),
	stackAlloc: (function(size) {
		var ret = STACKTOP;
		STACKTOP = STACKTOP + size | 0;
		STACKTOP = STACKTOP + 15 & -16;
		return ret
	}),
	staticAlloc: (function(size) {
		var ret = STATICTOP;
		STATICTOP = STATICTOP + size | 0;
		STATICTOP = STATICTOP + 15 & -16;
		return ret
	}),
	dynamicAlloc: (function(size) {
		var ret = DYNAMICTOP;
		DYNAMICTOP = DYNAMICTOP + size | 0;
		DYNAMICTOP = DYNAMICTOP + 15 & -16;
		if (DYNAMICTOP >= TOTAL_MEMORY) enlargeMemory();
		return ret
	}),
	alignMemory: (function(size, quantum) {
		var ret = size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16);
		return ret
	}),
	makeBigInt: (function(low, high, unsigned) {
		var ret = unsigned ? +(low >>> 0) + +(high >>> 0) * +4294967296 : +(low >>> 0) + +(high | 0) * +4294967296;
		return ret
	}),
	GLOBAL_BASE: 8,
	QUANTUM_SIZE: 4,
	__dummy__: 0
};
Module["Runtime"] = Runtime;
var __THREW__ = 0;
var ABORT = false;
var EXITSTATUS = 0;
var undef = 0;
var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD, tempDouble, tempFloat;
var tempI64, tempI64b;
var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;

function assert(condition, text) {
	if (!condition) {
		abort("Assertion failed: " + text)
	}
}
var globalScope = this;

function getCFunc(ident) {
	var func = Module["_" + ident];
	if (!func) {
		try {
			func = eval("_" + ident)
		} catch (e) {}
	}
	assert(func, "Cannot call unknown function " + ident + " (perhaps LLVM optimizations or closure removed it?)");
	return func
}
var cwrap, ccall;
((function() {
	var stack = 0;
	var JSfuncs = {
		"stackSave": (function() {
			stack = Runtime.stackSave()
		}),
		"stackRestore": (function() {
			Runtime.stackRestore(stack)
		}),
		"arrayToC": (function(arr) {
			var ret = Runtime.stackAlloc(arr.length);
			writeArrayToMemory(arr, ret);
			return ret
		}),
		"stringToC": (function(str) {
			var ret = 0;
			if (str !== null && str !== undefined && str !== 0) {
				ret = Runtime.stackAlloc((str.length << 2) + 1);
				writeStringToMemory(str, ret)
			}
			return ret
		})
	};
	var toC = {
		"string": JSfuncs["stringToC"],
		"array": JSfuncs["arrayToC"]
	};
	ccall = function ccallFunc(ident, returnType, argTypes, args) {
		var func = getCFunc(ident);
		var cArgs = [];
		if (args) {
			for (var i = 0; i < args.length; i++) {
				var converter = toC[argTypes[i]];
				if (converter) {
					if (stack === 0) stack = Runtime.stackSave();
					cArgs[i] = converter(args[i])
				} else {
					cArgs[i] = args[i]
				}
			}
		}
		var ret = func.apply(null, cArgs);
		if (returnType === "string") ret = Pointer_stringify(ret);
		if (stack !== 0) JSfuncs["stackRestore"]();
		return ret
	};
	var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;

	function parseJSFunc(jsfunc) {
		var parsed = jsfunc.toString().match(sourceRegex).slice(1);
		return {
			arguments: parsed[0],
			body: parsed[1],
			returnValue: parsed[2]
		}
	}
	var JSsource = {};
	for (var fun in JSfuncs) {
		if (JSfuncs.hasOwnProperty(fun)) {
			JSsource[fun] = parseJSFunc(JSfuncs[fun])
		}
	}
	cwrap = function cwrap(ident, returnType, argTypes) {
		argTypes = argTypes || [];
		var cfunc = getCFunc(ident);
		var numericArgs = argTypes.every((function(type) {
			return type === "number"
		}));
		var numericRet = returnType !== "string";
		if (numericRet && numericArgs) {
			return cfunc
		}
		var argNames = argTypes.map((function(x, i) {
			return "$" + i
		}));
		var funcstr = "(function(" + argNames.join(",") + ") {";
		var nargs = argTypes.length;
		if (!numericArgs) {
			funcstr += JSsource["stackSave"].body + ";";
			for (var i = 0; i < nargs; i++) {
				var arg = argNames[i],
					type = argTypes[i];
				if (type === "number") continue;
				var convertCode = JSsource[type + "ToC"];
				funcstr += "var " + convertCode.arguments + " = " + arg + ";";
				funcstr += convertCode.body + ";";
				funcstr += arg + "=" + convertCode.returnValue + ";"
			}
		}
		var cfuncname = parseJSFunc((function() {
			return cfunc
		})).returnValue;
		funcstr += "var ret = " + cfuncname + "(" + argNames.join(",") + ");";
		if (!numericRet) {
			var strgfy = parseJSFunc((function() {
				return Pointer_stringify
			})).returnValue;
			funcstr += "ret = " + strgfy + "(ret);"
		}
		if (!numericArgs) {
			funcstr += JSsource["stackRestore"].body + ";"
		}
		funcstr += "return ret})";
		return eval(funcstr)
	}
}))();
Module["cwrap"] = cwrap;
Module["ccall"] = ccall;

function setValue(ptr, value, type, noSafe) {
	type = type || "i8";
	if (type.charAt(type.length - 1) === "*") type = "i32";
	switch (type) {
	case "i1":
		HEAP8[ptr >> 0] = value;
		break;
	case "i8":
		HEAP8[ptr >> 0] = value;
		break;
	case "i16":
		HEAP16[ptr >> 1] = value;
		break;
	case "i32":
		HEAP32[ptr >> 2] = value;
		break;
	case "i64":
		tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~ + Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
		break;
	case "float":
		HEAPF32[ptr >> 2] = value;
		break;
	case "double":
		HEAPF64[ptr >> 3] = value;
		break;
	default:
		abort("invalid type for setValue: " + type)
	}
}
Module["setValue"] = setValue;

function getValue(ptr, type, noSafe) {
	type = type || "i8";
	if (type.charAt(type.length - 1) === "*") type = "i32";
	switch (type) {
	case "i1":
		return HEAP8[ptr >> 0];
	case "i8":
		return HEAP8[ptr >> 0];
	case "i16":
		return HEAP16[ptr >> 1];
	case "i32":
		return HEAP32[ptr >> 2];
	case "i64":
		return HEAP32[ptr >> 2];
	case "float":
		return HEAPF32[ptr >> 2];
	case "double":
		return HEAPF64[ptr >> 3];
	default:
		abort("invalid type for setValue: " + type)
	}
	return null
}
Module["getValue"] = getValue;
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
var ALLOC_STATIC = 2;
var ALLOC_DYNAMIC = 3;
var ALLOC_NONE = 4;
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

function allocate(slab, types, allocator, ptr) {
	var zeroinit, size;
	if (typeof slab === "number") {
		zeroinit = true;
		size = slab
	} else {
		zeroinit = false;
		size = slab.length
	}
	var singleType = typeof types === "string" ? types : null;
	var ret;
	if (allocator == ALLOC_NONE) {
		ret = ptr
	} else {
		ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length))
	}
	if (zeroinit) {
		var ptr = ret,
			stop;
		assert((ret & 3) == 0);
		stop = ret + (size & ~3);
		for (; ptr < stop; ptr += 4) {
			HEAP32[ptr >> 2] = 0
		}
		stop = ret + size;
		while (ptr < stop) {
			HEAP8[ptr++ >> 0] = 0
		}
		return ret
	}
	if (singleType === "i8") {
		if (slab.subarray || slab.slice) {
			HEAPU8.set(slab, ret)
		} else {
			HEAPU8.set(new Uint8Array(slab), ret)
		}
		return ret
	}
	var i = 0,
		type, typeSize, previousType;
	while (i < size) {
		var curr = slab[i];
		if (typeof curr === "function") {
			curr = Runtime.getFunctionIndex(curr)
		}
		type = singleType || types[i];
		if (type === 0) {
			i++;
			continue
		}
		if (type == "i64") type = "i32";
		setValue(ret + i, curr, type);
		if (previousType !== type) {
			typeSize = Runtime.getNativeTypeSize(type);
			previousType = type
		}
		i += typeSize
	}
	return ret
}
Module["allocate"] = allocate;

function Pointer_stringify(ptr, length) {
	if (length === 0) return "";
	var hasUtf = false;
	var t;
	var i = 0;
	while (1) {
		t = HEAPU8[ptr + i >> 0];
		if (t >= 128) hasUtf = true;
		else if (t == 0 && !length) break;
		i++;
		if (length && i == length) break
	}
	if (!length) length = i;
	var ret = "";
	if (!hasUtf) {
		var MAX_CHUNK = 1024;
		var curr;
		while (length > 0) {
			curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
			ret = ret ? ret + curr : curr;
			ptr += MAX_CHUNK;
			length -= MAX_CHUNK
		}
		return ret
	}
	var utf8 = new Runtime.UTF8Processor;
	for (i = 0; i < length; i++) {
		t = HEAPU8[ptr + i >> 0];
		ret += utf8.processCChar(t)
	}
	return ret
}
Module["Pointer_stringify"] = Pointer_stringify;

function UTF16ToString(ptr) {
	var i = 0;
	var str = "";
	while (1) {
		var codeUnit = HEAP16[ptr + i * 2 >> 1];
		if (codeUnit == 0) return str;
		++i;
		str += String.fromCharCode(codeUnit)
	}
}
Module["UTF16ToString"] = UTF16ToString;

function stringToUTF16(str, outPtr) {
	for (var i = 0; i < str.length; ++i) {
		var codeUnit = str.charCodeAt(i);
		HEAP16[outPtr + i * 2 >> 1] = codeUnit
	}
	HEAP16[outPtr + str.length * 2 >> 1] = 0
}
Module["stringToUTF16"] = stringToUTF16;

function UTF32ToString(ptr) {
	var i = 0;
	var str = "";
	while (1) {
		var utf32 = HEAP32[ptr + i * 4 >> 2];
		if (utf32 == 0) return str;
		++i;
		if (utf32 >= 65536) {
			var ch = utf32 - 65536;
			str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
		} else {
			str += String.fromCharCode(utf32)
		}
	}
}
Module["UTF32ToString"] = UTF32ToString;

function stringToUTF32(str, outPtr) {
	var iChar = 0;
	for (var iCodeUnit = 0; iCodeUnit < str.length; ++iCodeUnit) {
		var codeUnit = str.charCodeAt(iCodeUnit);
		if (codeUnit >= 55296 && codeUnit <= 57343) {
			var trailSurrogate = str.charCodeAt(++iCodeUnit);
			codeUnit = 65536 + ((codeUnit & 1023) << 10) | trailSurrogate & 1023
		}
		HEAP32[outPtr + iChar * 4 >> 2] = codeUnit;
		++iChar
	}
	HEAP32[outPtr + iChar * 4 >> 2] = 0
}
Module["stringToUTF32"] = stringToUTF32;

function demangle(func) {
	var hasLibcxxabi = !! Module["___cxa_demangle"];
	if (hasLibcxxabi) {
		try {
			var buf = _malloc(func.length);
			writeStringToMemory(func.substr(1), buf);
			var status = _malloc(4);
			var ret = Module["___cxa_demangle"](buf, 0, 0, status);
			if (getValue(status, "i32") === 0 && ret) {
				return Pointer_stringify(ret)
			}
		} catch (e) {} finally {
			if (buf) _free(buf);
			if (status) _free(status);
			if (ret) _free(ret)
		}
	}
	var i = 3;
	var basicTypes = {
		"v": "void",
		"b": "bool",
		"c": "char",
		"s": "short",
		"i": "int",
		"l": "long",
		"f": "float",
		"d": "double",
		"w": "wchar_t",
		"a": "signed char",
		"h": "unsigned char",
		"t": "unsigned short",
		"j": "unsigned int",
		"m": "unsigned long",
		"x": "long long",
		"y": "unsigned long long",
		"z": "..."
	};
	var subs = [];
	var first = true;

	function dump(x) {
		if (x) Module.print(x);
		Module.print(func);
		var pre = "";
		for (var a = 0; a < i; a++) pre += " ";
		Module.print(pre + "^")
	}
	function parseNested() {
		i++;
		if (func[i] === "K") i++;
		var parts = [];
		while (func[i] !== "E") {
			if (func[i] === "S") {
				i++;
				var next = func.indexOf("_", i);
				var num = func.substring(i, next) || 0;
				parts.push(subs[num] || "?");
				i = next + 1;
				continue
			}
			if (func[i] === "C") {
				parts.push(parts[parts.length - 1]);
				i += 2;
				continue
			}
			var size = parseInt(func.substr(i));
			var pre = size.toString().length;
			if (!size || !pre) {
				i--;
				break
			}
			var curr = func.substr(i + pre, size);
			parts.push(curr);
			subs.push(curr);
			i += pre + size
		}
		i++;
		return parts
	}
	function parse(rawList, limit, allowVoid) {
		limit = limit || Infinity;
		var ret = "",
			list = [];

		function flushList() {
			return "(" + list.join(", ") + ")"
		}
		var name;
		if (func[i] === "N") {
			name = parseNested().join("::");
			limit--;
			if (limit === 0) return rawList ? [name] : name
		} else {
			if (func[i] === "K" || first && func[i] === "L") i++;
			var size = parseInt(func.substr(i));
			if (size) {
				var pre = size.toString().length;
				name = func.substr(i + pre, size);
				i += pre + size
			}
		}
		first = false;
		if (func[i] === "I") {
			i++;
			var iList = parse(true);
			var iRet = parse(true, 1, true);
			ret += iRet[0] + " " + name + "<" + iList.join(", ") + ">"
		} else {
			ret = name
		}
		paramLoop: while (i < func.length && limit-- > 0) {
			var c = func[i++];
			if (c in basicTypes) {
				list.push(basicTypes[c])
			} else {
				switch (c) {
				case "P":
					list.push(parse(true, 1, true)[0] + "*");
					break;
				case "R":
					list.push(parse(true, 1, true)[0] + "&");
					break;
				case "L":
					{
						i++;
						var end = func.indexOf("E", i);
						var size = end - i;
						list.push(func.substr(i, size));
						i += size + 2;
						break
					};
				case "A":
					{
						var size = parseInt(func.substr(i));
						i += size.toString().length;
						if (func[i] !== "_") throw "?";
						i++;
						list.push(parse(true, 1, true)[0] + " [" + size + "]");
						break
					};
				case "E":
					break paramLoop;
				default:
					ret += "?" + c;
					break paramLoop
				}
			}
		}
		if (!allowVoid && list.length === 1 && list[0] === "void") list = [];
		if (rawList) {
			if (ret) {
				list.push(ret + "?")
			}
			return list
		} else {
			return ret + flushList()
		}
	}
	var final = func;
	try {
		if (func == "Object._main" || func == "_main") {
			return "main()"
		}
		if (typeof func === "number") func = Pointer_stringify(func);
		if (func[0] !== "_") return func;
		if (func[1] !== "_") return func;
		if (func[2] !== "Z") return func;
		switch (func[3]) {
		case "n":
			return "operator new()";
		case "d":
			return "operator delete()"
		}
		final = parse()
	} catch (e) {
		final += "?"
	}
	if (final.indexOf("?") >= 0 && !hasLibcxxabi) {
		Runtime.warnOnce("warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling")
	}
	return final
}
function demangleAll(text) {
	return text.replace(/__Z[\w\d_]+/g, (function(x) {
		var y = demangle(x);
		return x === y ? x : x + " [" + y + "]"
	}))
}
function jsStackTrace() {
	var err = new Error;
	if (!err.stack) {
		try {
			throw new Error(0)
		} catch (e) {
			err = e
		}
		if (!err.stack) {
			return "(no stack trace available)"
		}
	}
	return err.stack.toString()
}
function stackTrace() {
	return demangleAll(jsStackTrace())
}
Module["stackTrace"] = stackTrace;
var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
	return x + 4095 & -4096
}
var HEAP;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var STATIC_BASE = 0,
	STATICTOP = 0,
	staticSealed = false;
var STACK_BASE = 0,
	STACKTOP = 0,
	STACK_MAX = 0;
var DYNAMIC_BASE = 0,
	DYNAMICTOP = 0;

function enlargeMemory() {
	abort("Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.")
}
var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
var FAST_MEMORY = Module["FAST_MEMORY"] || 2097152;
var totalMemory = 64 * 1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
	if (totalMemory < 16 * 1024 * 1024) {
		totalMemory *= 2
	} else {
		totalMemory += 16 * 1024 * 1024
	}
}
if (totalMemory !== TOTAL_MEMORY) {
	Module.printErr("increasing TOTAL_MEMORY to " + totalMemory + " to be compliant with the asm.js spec");
	TOTAL_MEMORY = totalMemory
}
assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && !! (new Int32Array(1))["subarray"] && !! (new Int32Array(1))["set"], "JS engine does not provide full typed array support");
var buffer = new ArrayBuffer(TOTAL_MEMORY);
HEAP8 = new Int8Array(buffer);
HEAP16 = new Int16Array(buffer);
HEAP32 = new Int32Array(buffer);
HEAPU8 = new Uint8Array(buffer);
HEAPU16 = new Uint16Array(buffer);
HEAPU32 = new Uint32Array(buffer);
HEAPF32 = new Float32Array(buffer);
HEAPF64 = new Float64Array(buffer);
HEAP32[0] = 255;
assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, "Typed arrays 2 must be run on a little-endian system");
Module["HEAP"] = HEAP;
Module["buffer"] = buffer;
Module["HEAP8"] = HEAP8;
Module["HEAP16"] = HEAP16;
Module["HEAP32"] = HEAP32;
Module["HEAPU8"] = HEAPU8;
Module["HEAPU16"] = HEAPU16;
Module["HEAPU32"] = HEAPU32;
Module["HEAPF32"] = HEAPF32;
Module["HEAPF64"] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
	while (callbacks.length > 0) {
		var callback = callbacks.shift();
		if (typeof callback == "function") {
			callback();
			continue
		}
		var func = callback.func;
		if (typeof func === "number") {
			if (callback.arg === undefined) {
				Runtime.dynCall("v", func)
			} else {
				Runtime.dynCall("vi", func, [callback.arg])
			}
		} else {
			func(callback.arg === undefined ? null : callback.arg)
		}
	}
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;

function preRun() {
	if (Module["preRun"]) {
		if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
		while (Module["preRun"].length) {
			addOnPreRun(Module["preRun"].shift())
		}
	}
	callRuntimeCallbacks(__ATPRERUN__)
}
function ensureInitRuntime() {
	if (runtimeInitialized) return;
	runtimeInitialized = true;
	callRuntimeCallbacks(__ATINIT__)
}
function preMain() {
	callRuntimeCallbacks(__ATMAIN__)
}
function exitRuntime() {
	callRuntimeCallbacks(__ATEXIT__);
	runtimeExited = true
}
function postRun() {
	if (Module["postRun"]) {
		if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
		while (Module["postRun"].length) {
			addOnPostRun(Module["postRun"].shift())
		}
	}
	callRuntimeCallbacks(__ATPOSTRUN__)
}
function addOnPreRun(cb) {
	__ATPRERUN__.unshift(cb)
}
Module["addOnPreRun"] = Module.addOnPreRun = addOnPreRun;

function addOnInit(cb) {
	__ATINIT__.unshift(cb)
}
Module["addOnInit"] = Module.addOnInit = addOnInit;

function addOnPreMain(cb) {
	__ATMAIN__.unshift(cb)
}
Module["addOnPreMain"] = Module.addOnPreMain = addOnPreMain;

function addOnExit(cb) {
	__ATEXIT__.unshift(cb)
}
Module["addOnExit"] = Module.addOnExit = addOnExit;

function addOnPostRun(cb) {
	__ATPOSTRUN__.unshift(cb)
}
Module["addOnPostRun"] = Module.addOnPostRun = addOnPostRun;

function intArrayFromString(stringy, dontAddNull, length) {
	var ret = (new Runtime.UTF8Processor).processJSString(stringy);
	if (length) {
		ret.length = length
	}
	if (!dontAddNull) {
		ret.push(0)
	}
	return ret
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
	var ret = [];
	for (var i = 0; i < array.length; i++) {
		var chr = array[i];
		if (chr > 255) {
			chr &= 255
		}
		ret.push(String.fromCharCode(chr))
	}
	return ret.join("")
}
Module["intArrayToString"] = intArrayToString;

function writeStringToMemory(string, buffer, dontAddNull) {
	var array = intArrayFromString(string, dontAddNull);
	var i = 0;
	while (i < array.length) {
		var chr = array[i];
		HEAP8[buffer + i >> 0] = chr;
		i = i + 1
	}
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
	for (var i = 0; i < array.length; i++) {
		HEAP8[buffer + i >> 0] = array[i]
	}
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
	for (var i = 0; i < str.length; i++) {
		HEAP8[buffer + i >> 0] = str.charCodeAt(i)
	}
	if (!dontAddNull) HEAP8[buffer + str.length >> 0] = 0
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
	if (value >= 0) {
		return value
	}
	return bits <= 32 ? 2 * Math.abs(1 << bits - 1) + value : Math.pow(2, bits) + value
}
function reSign(value, bits, ignore) {
	if (value <= 0) {
		return value
	}
	var half = bits <= 32 ? Math.abs(1 << bits - 1) : Math.pow(2, bits - 1);
	if (value >= half && (bits <= 32 || value > half)) {
		value = -2 * half + value
	}
	return value
}
if (!Math["imul"] || Math["imul"](4294967295, 5) !== -5) Math["imul"] = function imul(a, b) {
	var ah = a >>> 16;
	var al = a & 65535;
	var bh = b >>> 16;
	var bl = b & 65535;
	return al * bl + (ah * bl + al * bh << 16) | 0
};
Math.imul = Math["imul"];
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;

function addRunDependency(id) {
	runDependencies++;
	if (Module["monitorRunDependencies"]) {
		Module["monitorRunDependencies"](runDependencies)
	}
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
	runDependencies--;
	if (Module["monitorRunDependencies"]) {
		Module["monitorRunDependencies"](runDependencies)
	}
	if (runDependencies == 0) {
		if (runDependencyWatcher !== null) {
			clearInterval(runDependencyWatcher);
			runDependencyWatcher = null
		}
		if (dependenciesFulfilled) {
			var callback = dependenciesFulfilled;
			dependenciesFulfilled = null;
			callback()
		}
	}
}
Module["removeRunDependency"] = removeRunDependency;
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var memoryInitializer = null;
STATIC_BASE = 8;
STATICTOP = STATIC_BASE + 31120;
__ATINIT__.push();
allocate([0, 64, 202, 69, 27, 76, 255, 82, 130, 90, 179, 98, 162, 107, 96, 117, 0, 1, 1, 1, 2, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 0, 3, 12, 15, 48, 51, 60, 63, 192, 195, 204, 207, 240, 243, 252, 255, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 11, 0, 0, 0, 4, 0, 0, 0, 14, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0, 6, 0, 0, 0, 13, 0, 0, 0, 2, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 0, 0, 157, 62, 0, 64, 94, 62, 0, 192, 4, 62, 0, 128, 237, 62, 0, 64, 137, 62, 0, 0, 0, 0, 0, 192, 76, 63, 0, 0, 205, 61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 254, 1, 0, 1, 255, 0, 254, 0, 253, 2, 0, 1, 255, 0, 254, 0, 253, 3, 0, 1, 255, 108, 105, 98, 111, 112, 117, 115, 32, 49, 46, 49, 46, 49, 45, 98, 101, 116, 97, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 25, 23, 2, 0, 0, 0, 0, 0, 126, 124, 119, 109, 87, 41, 19, 9, 4, 2, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 25, 23, 2, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 128, 64, 0, 0, 160, 64, 0, 0, 192, 64, 0, 0, 224, 64, 0, 0, 0, 65, 0, 0, 128, 65, 0, 0, 192, 65, 0, 0, 16, 66, 0, 0, 48, 66, 0, 0, 72, 66, 0, 0, 96, 66, 0, 0, 120, 66, 0, 0, 134, 66, 0, 0, 144, 66, 0, 0, 158, 66, 0, 0, 176, 66, 0, 0, 212, 66, 0, 0, 6, 67, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 64, 64, 0, 0, 128, 64, 0, 0, 160, 64, 0, 0, 192, 64, 0, 0, 0, 65, 0, 0, 0, 65, 0, 0, 0, 0, 126, 124, 119, 109, 87, 41, 19, 9, 4, 2, 0, 0, 0, 0, 0, 0, 255, 255, 156, 110, 86, 70, 59, 51, 45, 40, 37, 33, 31, 28, 26, 25, 23, 22, 21, 20, 19, 18, 17, 16, 16, 15, 15, 14, 13, 13, 12, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 192, 2, 0, 0, 128, 5, 0, 0, 60, 8, 0, 0, 244, 10, 0, 0, 168, 13, 0, 0, 88, 16, 0, 0, 4, 19, 0, 0, 108, 20, 0, 0, 40, 21, 0, 0, 156, 21, 0, 0, 232, 21, 0, 0, 32, 22, 0, 0, 64, 22, 0, 0, 88, 22, 0, 0, 100, 22, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 7, 0, 0, 0, 9, 0, 0, 0, 11, 0, 0, 0, 13, 0, 0, 0, 15, 0, 0, 0, 17, 0, 0, 0, 19, 0, 0, 0, 21, 0, 0, 0, 23, 0, 0, 0, 25, 0, 0, 0, 27, 0, 0, 0, 29, 0, 0, 0, 31, 0, 0, 0, 33, 0, 0, 0, 35, 0, 0, 0, 37, 0, 0, 0, 39, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 49, 0, 0, 0, 51, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 57, 0, 0, 0, 59, 0, 0, 0, 61, 0, 0, 0, 63, 0, 0, 0, 65, 0, 0, 0, 67, 0, 0, 0, 69, 0, 0, 0, 71, 0, 0, 0, 73, 0, 0, 0, 75, 0, 0, 0, 77, 0, 0, 0, 79, 0, 0, 0, 81, 0, 0, 0, 83, 0, 0, 0, 85, 0, 0, 0, 87, 0, 0, 0, 89, 0, 0, 0, 91, 0, 0, 0, 93, 0, 0, 0, 95, 0, 0, 0, 97, 0, 0, 0, 99, 0, 0, 0, 101, 0, 0, 0, 103, 0, 0, 0, 105, 0, 0, 0, 107, 0, 0, 0, 109, 0, 0, 0, 111, 0, 0, 0, 113, 0, 0, 0, 115, 0, 0, 0, 117, 0, 0, 0, 119, 0, 0, 0, 121, 0, 0, 0, 123, 0, 0, 0, 125, 0, 0, 0, 127, 0, 0, 0, 129, 0, 0, 0, 131, 0, 0, 0, 133, 0, 0, 0, 135, 0, 0, 0, 137, 0, 0, 0, 139, 0, 0, 0, 141, 0, 0, 0, 143, 0, 0, 0, 145, 0, 0, 0, 147, 0, 0, 0, 149, 0, 0, 0, 151, 0, 0, 0, 153, 0, 0, 0, 155, 0, 0, 0, 157, 0, 0, 0, 159, 0, 0, 0, 161, 0, 0, 0, 163, 0, 0, 0, 165, 0, 0, 0, 167, 0, 0, 0, 169, 0, 0, 0, 171, 0, 0, 0, 173, 0, 0, 0, 175, 0, 0, 0, 177, 0, 0, 0, 179, 0, 0, 0, 181, 0, 0, 0, 183, 0, 0, 0, 185, 0, 0, 0, 187, 0, 0, 0, 189, 0, 0, 0, 191, 0, 0, 0, 193, 0, 0, 0, 195, 0, 0, 0, 197, 0, 0, 0, 199, 0, 0, 0, 201, 0, 0, 0, 203, 0, 0, 0, 205, 0, 0, 0, 207, 0, 0, 0, 209, 0, 0, 0, 211, 0, 0, 0, 213, 0, 0, 0, 215, 0, 0, 0, 217, 0, 0, 0, 219, 0, 0, 0, 221, 0, 0, 0, 223, 0, 0, 0, 225, 0, 0, 0, 227, 0, 0, 0, 229, 0, 0, 0, 231, 0, 0, 0, 233, 0, 0, 0, 235, 0, 0, 0, 237, 0, 0, 0, 239, 0, 0, 0, 241, 0, 0, 0, 243, 0, 0, 0, 245, 0, 0, 0, 247, 0, 0, 0, 249, 0, 0, 0, 251, 0, 0, 0, 253, 0, 0, 0, 255, 0, 0, 0, 1, 1, 0, 0, 3, 1, 0, 0, 5, 1, 0, 0, 7, 1, 0, 0, 9, 1, 0, 0, 11, 1, 0, 0, 13, 1, 0, 0, 15, 1, 0, 0, 17, 1, 0, 0, 19, 1, 0, 0, 21, 1, 0, 0, 23, 1, 0, 0, 25, 1, 0, 0, 27, 1, 0, 0, 29, 1, 0, 0, 31, 1, 0, 0, 33, 1, 0, 0, 35, 1, 0, 0, 37, 1, 0, 0, 39, 1, 0, 0, 41, 1, 0, 0, 43, 1, 0, 0, 45, 1, 0, 0, 47, 1, 0, 0, 49, 1, 0, 0, 51, 1, 0, 0, 53, 1, 0, 0, 55, 1, 0, 0, 57, 1, 0, 0, 59, 1, 0, 0, 61, 1, 0, 0, 63, 1, 0, 0, 65, 1, 0, 0, 67, 1, 0, 0, 69, 1, 0, 0, 71, 1, 0, 0, 73, 1, 0, 0, 75, 1, 0, 0, 77, 1, 0, 0, 79, 1, 0, 0, 81, 1, 0, 0, 83, 1, 0, 0, 85, 1, 0, 0, 87, 1, 0, 0, 89, 1, 0, 0, 91, 1, 0, 0, 93, 1, 0, 0, 95, 1, 0, 0, 13, 0, 0, 0, 25, 0, 0, 0, 41, 0, 0, 0, 61, 0, 0, 0, 85, 0, 0, 0, 113, 0, 0, 0, 145, 0, 0, 0, 181, 0, 0, 0, 221, 0, 0, 0, 9, 1, 0, 0, 57, 1, 0, 0, 109, 1, 0, 0, 165, 1, 0, 0, 225, 1, 0, 0, 33, 2, 0, 0, 101, 2, 0, 0, 173, 2, 0, 0, 249, 2, 0, 0, 73, 3, 0, 0, 157, 3, 0, 0, 245, 3, 0, 0, 81, 4, 0, 0, 177, 4, 0, 0, 21, 5, 0, 0, 125, 5, 0, 0, 233, 5, 0, 0, 89, 6, 0, 0, 205, 6, 0, 0, 69, 7, 0, 0, 193, 7, 0, 0, 65, 8, 0, 0, 197, 8, 0, 0, 77, 9, 0, 0, 217, 9, 0, 0, 105, 10, 0, 0, 253, 10, 0, 0, 149, 11, 0, 0, 49, 12, 0, 0, 209, 12, 0, 0, 117, 13, 0, 0, 29, 14, 0, 0, 201, 14, 0, 0, 121, 15, 0, 0, 45, 16, 0, 0, 229, 16, 0, 0, 161, 17, 0, 0, 97, 18, 0, 0, 37, 19, 0, 0, 237, 19, 0, 0, 185, 20, 0, 0, 137, 21, 0, 0, 93, 22, 0, 0, 53, 23, 0, 0, 17, 24, 0, 0, 241, 24, 0, 0, 213, 25, 0, 0, 189, 26, 0, 0, 169, 27, 0, 0, 153, 28, 0, 0, 141, 29, 0, 0, 133, 30, 0, 0, 129, 31, 0, 0, 129, 32, 0, 0, 133, 33, 0, 0, 141, 34, 0, 0, 153, 35, 0, 0, 169, 36, 0, 0, 189, 37, 0, 0, 213, 38, 0, 0, 241, 39, 0, 0, 17, 41, 0, 0, 53, 42, 0, 0, 93, 43, 0, 0, 137, 44, 0, 0, 185, 45, 0, 0, 237, 46, 0, 0, 37, 48, 0, 0, 97, 49, 0, 0, 161, 50, 0, 0, 229, 51, 0, 0, 45, 53, 0, 0, 121, 54, 0, 0, 201, 55, 0, 0, 29, 57, 0, 0, 117, 58, 0, 0, 209, 59, 0, 0, 49, 61, 0, 0, 149, 62, 0, 0, 253, 63, 0, 0, 105, 65, 0, 0, 217, 66, 0, 0, 77, 68, 0, 0, 197, 69, 0, 0, 65, 71, 0, 0, 193, 72, 0, 0, 69, 74, 0, 0, 205, 75, 0, 0, 89, 77, 0, 0, 233, 78, 0, 0, 125, 80, 0, 0, 21, 82, 0, 0, 177, 83, 0, 0, 81, 85, 0, 0, 245, 86, 0, 0, 157, 88, 0, 0, 73, 90, 0, 0, 249, 91, 0, 0, 173, 93, 0, 0, 101, 95, 0, 0, 33, 97, 0, 0, 225, 98, 0, 0, 165, 100, 0, 0, 109, 102, 0, 0, 57, 104, 0, 0, 9, 106, 0, 0, 221, 107, 0, 0, 181, 109, 0, 0, 145, 111, 0, 0, 113, 113, 0, 0, 85, 115, 0, 0, 61, 117, 0, 0, 41, 119, 0, 0, 25, 121, 0, 0, 13, 123, 0, 0, 5, 125, 0, 0, 1, 127, 0, 0, 1, 129, 0, 0, 5, 131, 0, 0, 13, 133, 0, 0, 25, 135, 0, 0, 41, 137, 0, 0, 61, 139, 0, 0, 85, 141, 0, 0, 113, 143, 0, 0, 145, 145, 0, 0, 181, 147, 0, 0, 221, 149, 0, 0, 9, 152, 0, 0, 57, 154, 0, 0, 109, 156, 0, 0, 165, 158, 0, 0, 225, 160, 0, 0, 33, 163, 0, 0, 101, 165, 0, 0, 173, 167, 0, 0, 249, 169, 0, 0, 73, 172, 0, 0, 157, 174, 0, 0, 245, 176, 0, 0, 81, 179, 0, 0, 177, 181, 0, 0, 21, 184, 0, 0, 125, 186, 0, 0, 233, 188, 0, 0, 89, 191, 0, 0, 205, 193, 0, 0, 69, 196, 0, 0, 193, 198, 0, 0, 65, 201, 0, 0, 197, 203, 0, 0, 77, 206, 0, 0, 217, 208, 0, 0, 105, 211, 0, 0, 253, 213, 0, 0, 149, 216, 0, 0, 49, 219, 0, 0, 209, 221, 0, 0, 117, 224, 0, 0, 29, 227, 0, 0, 201, 229, 0, 0, 121, 232, 0, 0, 45, 235, 0, 0, 229, 237, 0, 0, 161, 240, 0, 0, 63, 0, 0, 0, 129, 0, 0, 0, 231, 0, 0, 0, 121, 1, 0, 0, 63, 2, 0, 0, 65, 3, 0, 0, 135, 4, 0, 0, 25, 6, 0, 0, 255, 7, 0, 0, 65, 10, 0, 0, 231, 12, 0, 0, 249, 15, 0, 0, 127, 19, 0, 0, 129, 23, 0, 0, 7, 28, 0, 0, 25, 33, 0, 0, 191, 38, 0, 0, 1, 45, 0, 0, 231, 51, 0, 0, 121, 59, 0, 0, 191, 67, 0, 0, 193, 76, 0, 0, 135, 86, 0, 0, 25, 97, 0, 0, 127, 108, 0, 0, 193, 120, 0, 0, 231, 133, 0, 0, 249, 147, 0, 0, 255, 162, 0, 0, 1, 179, 0, 0, 7, 196, 0, 0, 25, 214, 0, 0, 63, 233, 0, 0, 129, 253, 0, 0, 231, 18, 1, 0, 121, 41, 1, 0, 63, 65, 1, 0, 65, 90, 1, 0, 135, 116, 1, 0, 25, 144, 1, 0, 255, 172, 1, 0, 65, 203, 1, 0, 231, 234, 1, 0, 249, 11, 2, 0, 127, 46, 2, 0, 129, 82, 2, 0, 7, 120, 2, 0, 25, 159, 2, 0, 191, 199, 2, 0, 1, 242, 2, 0, 231, 29, 3, 0, 121, 75, 3, 0, 191, 122, 3, 0, 193, 171, 3, 0, 135, 222, 3, 0, 25, 19, 4, 0, 127, 73, 4, 0, 193, 129, 4, 0, 231, 187, 4, 0, 249, 247, 4, 0, 255, 53, 5, 0, 1, 118, 5, 0, 7, 184, 5, 0, 25, 252, 5, 0, 63, 66, 6, 0, 129, 138, 6, 0, 231, 212, 6, 0, 121, 33, 7, 0, 63, 112, 7, 0, 65, 193, 7, 0, 135, 20, 8, 0, 25, 106, 8, 0, 255, 193, 8, 0, 65, 28, 9, 0, 231, 120, 9, 0, 249, 215, 9, 0, 127, 57, 10, 0, 129, 157, 10, 0, 7, 4, 11, 0, 25, 109, 11, 0, 191, 216, 11, 0, 1, 71, 12, 0, 231, 183, 12, 0, 121, 43, 13, 0, 191, 161, 13, 0, 193, 26, 14, 0, 135, 150, 14, 0, 25, 21, 15, 0, 127, 150, 15, 0, 193, 26, 16, 0, 231, 161, 16, 0, 249, 43, 17, 0, 255, 184, 17, 0, 1, 73, 18, 0, 7, 220, 18, 0, 25, 114, 19, 0, 63, 11, 20, 0, 129, 167, 20, 0, 231, 70, 21, 0, 121, 233, 21, 0, 63, 143, 22, 0, 65, 56, 23, 0, 135, 228, 23, 0, 25, 148, 24, 0, 255, 70, 25, 0, 65, 253, 25, 0, 231, 182, 26, 0, 249, 115, 27, 0, 127, 52, 28, 0, 129, 248, 28, 0, 7, 192, 29, 0, 25, 139, 30, 0, 191, 89, 31, 0, 1, 44, 32, 0, 231, 1, 33, 0, 121, 219, 33, 0, 191, 184, 34, 0, 193, 153, 35, 0, 135, 126, 36, 0, 25, 103, 37, 0, 127, 83, 38, 0, 193, 67, 39, 0, 231, 55, 40, 0, 249, 47, 41, 0, 255, 43, 42, 0, 1, 44, 43, 0, 7, 48, 44, 0, 25, 56, 45, 0, 63, 68, 46, 0, 129, 84, 47, 0, 231, 104, 48, 0, 121, 129, 49, 0, 63, 158, 50, 0, 65, 191, 51, 0, 135, 228, 52, 0, 25, 14, 54, 0, 255, 59, 55, 0, 65, 110, 56, 0, 231, 164, 57, 0, 249, 223, 58, 0, 127, 31, 60, 0, 129, 99, 61, 0, 7, 172, 62, 0, 25, 249, 63, 0, 191, 74, 65, 0, 1, 161, 66, 0, 231, 251, 67, 0, 121, 91, 69, 0, 191, 191, 70, 0, 193, 40, 72, 0, 135, 150, 73, 0, 25, 9, 75, 0, 127, 128, 76, 0, 193, 252, 77, 0, 231, 125, 79, 0, 249, 3, 81, 0, 255, 142, 82, 0, 1, 31, 84, 0, 7, 180, 85, 0, 25, 78, 87, 0, 63, 237, 88, 0, 129, 145, 90, 0, 231, 58, 92, 0, 121, 233, 93, 0, 63, 157, 95, 0, 65, 86, 97, 0, 135, 20, 99, 0, 25, 216, 100, 0, 255, 160, 102, 0, 65, 111, 104, 0, 231, 66, 106, 0, 249, 27, 108, 0, 127, 250, 109, 0, 65, 1, 0, 0, 169, 2, 0, 0, 9, 5, 0, 0, 193, 8, 0, 0, 65, 14, 0, 0, 9, 22, 0, 0, 169, 32, 0, 0, 193, 46, 0, 0, 1, 65, 0, 0, 41, 88, 0, 0, 9, 117, 0, 0, 129, 152, 0, 0, 129, 195, 0, 0, 9, 247, 0, 0, 41, 52, 1, 0, 1, 124, 1, 0, 193, 207, 1, 0, 169, 48, 2, 0, 9, 160, 2, 0, 65, 31, 3, 0, 193, 175, 3, 0, 9, 83, 4, 0, 169, 10, 5, 0, 65, 216, 5, 0, 129, 189, 6, 0, 41, 188, 7, 0, 9, 214, 8, 0, 1, 13, 10, 0, 1, 99, 11, 0, 9, 218, 12, 0, 41, 116, 14, 0, 129, 51, 16, 0, 65, 26, 18, 0, 169, 42, 20, 0, 9, 103, 22, 0, 193, 209, 24, 0, 65, 109, 27, 0, 9, 60, 30, 0, 169, 64, 33, 0, 193, 125, 36, 0, 1, 246, 39, 0, 41, 172, 43, 0, 9, 163, 47, 0, 129, 221, 51, 0, 129, 94, 56, 0, 9, 41, 61, 0, 41, 64, 66, 0, 1, 167, 71, 0, 193, 96, 77, 0, 169, 112, 83, 0, 9, 218, 89, 0, 65, 160, 96, 0, 193, 198, 103, 0, 9, 81, 111, 0, 169, 66, 119, 0, 65, 159, 127, 0, 129, 106, 136, 0, 41, 168, 145, 0, 9, 92, 155, 0, 1, 138, 165, 0, 1, 54, 176, 0, 9, 100, 187, 0, 41, 24, 199, 0, 129, 86, 211, 0, 65, 35, 224, 0, 169, 130, 237, 0, 9, 121, 251, 0, 193, 10, 10, 1, 65, 60, 25, 1, 9, 18, 41, 1, 169, 144, 57, 1, 193, 188, 74, 1, 1, 155, 92, 1, 41, 48, 111, 1, 9, 129, 130, 1, 129, 146, 150, 1, 129, 105, 171, 1, 9, 11, 193, 1, 41, 124, 215, 1, 1, 194, 238, 1, 193, 225, 6, 2, 169, 224, 31, 2, 9, 196, 57, 2, 65, 145, 84, 2, 193, 77, 112, 2, 9, 255, 140, 2, 169, 170, 170, 2, 65, 86, 201, 2, 129, 7, 233, 2, 41, 196, 9, 3, 9, 146, 43, 3, 1, 119, 78, 3, 1, 121, 114, 3, 9, 158, 151, 3, 41, 236, 189, 3, 129, 105, 229, 3, 65, 28, 14, 4, 169, 10, 56, 4, 9, 59, 99, 4, 193, 179, 143, 4, 65, 123, 189, 4, 9, 152, 236, 4, 169, 16, 29, 5, 193, 235, 78, 5, 1, 48, 130, 5, 41, 228, 182, 5, 9, 15, 237, 5, 129, 183, 36, 6, 129, 228, 93, 6, 9, 157, 152, 6, 41, 232, 212, 6, 1, 205, 18, 7, 193, 82, 82, 7, 169, 128, 147, 7, 9, 94, 214, 7, 65, 242, 26, 8, 193, 68, 97, 8, 9, 93, 169, 8, 169, 66, 243, 8, 65, 253, 62, 9, 129, 148, 140, 9, 41, 16, 220, 9, 9, 120, 45, 10, 1, 212, 128, 10, 1, 44, 214, 10, 9, 136, 45, 11, 41, 240, 134, 11, 129, 108, 226, 11, 65, 5, 64, 12, 169, 194, 159, 12, 9, 173, 1, 13, 193, 204, 101, 13, 65, 42, 204, 13, 9, 206, 52, 14, 169, 192, 159, 14, 193, 10, 13, 15, 1, 181, 124, 15, 41, 200, 238, 15, 9, 77, 99, 16, 129, 76, 218, 16, 129, 207, 83, 17, 9, 223, 207, 17, 41, 132, 78, 18, 1, 200, 207, 18, 193, 179, 83, 19, 169, 80, 218, 19, 9, 168, 99, 20, 65, 195, 239, 20, 193, 171, 126, 21, 9, 107, 16, 22, 169, 10, 165, 22, 65, 148, 60, 23, 129, 17, 215, 23, 41, 140, 116, 24, 9, 14, 21, 25, 1, 161, 184, 25, 1, 79, 95, 26, 9, 34, 9, 27, 41, 36, 182, 27, 129, 95, 102, 28, 65, 222, 25, 29, 169, 170, 208, 29, 9, 207, 138, 30, 193, 85, 72, 31, 65, 73, 9, 32, 9, 180, 205, 32, 169, 160, 149, 33, 193, 25, 97, 34, 1, 42, 48, 35, 41, 220, 2, 36, 9, 59, 217, 36, 129, 81, 179, 37, 147, 6, 0, 0, 69, 14, 0, 0, 15, 28, 0, 0, 17, 51, 0, 0, 91, 87, 0, 0, 13, 142, 0, 0, 119, 221, 0, 0, 57, 77, 1, 0, 99, 230, 1, 0, 149, 179, 2, 0, 31, 193, 3, 0, 33, 29, 5, 0, 171, 215, 6, 0, 221, 2, 9, 0, 7, 179, 11, 0, 201, 254, 14, 0, 51, 255, 18, 0, 229, 207, 23, 0, 47, 143, 29, 0, 49, 94, 36, 0, 251, 96, 44, 0, 173, 190, 53, 0, 151, 161, 64, 0, 89, 55, 77, 0, 3, 177, 91, 0, 53, 67, 108, 0, 63, 38, 127, 0, 65, 150, 148, 0, 75, 211, 172, 0, 125, 33, 200, 0, 39, 201, 230, 0, 233, 22, 9, 1, 211, 91, 47, 1, 133, 237, 89, 1, 79, 38, 137, 1, 81, 101, 189, 1, 155, 14, 247, 1, 77, 139, 54, 2, 183, 73, 124, 2, 121, 189, 200, 2, 163, 95, 28, 3, 213, 174, 119, 3, 95, 47, 219, 3, 97, 107, 71, 4, 235, 242, 188, 4, 29, 92, 60, 5, 71, 67, 198, 5, 9, 75, 91, 6, 115, 28, 252, 6, 37, 103, 169, 7, 111, 225, 99, 8, 113, 72, 44, 9, 59, 96, 3, 10, 237, 243, 233, 10, 215, 213, 224, 11, 153, 223, 232, 12, 67, 242, 2, 14, 117, 246, 47, 15, 127, 220, 112, 16, 129, 156, 198, 17, 139, 54, 50, 19, 189, 178, 180, 20, 103, 33, 79, 22, 41, 155, 2, 24, 19, 65, 208, 25, 197, 60, 185, 27, 143, 192, 190, 29, 145, 7, 226, 31, 219, 85, 36, 34, 141, 248, 134, 36, 247, 69, 11, 39, 185, 157, 178, 41, 227, 104, 126, 44, 21, 26, 112, 47, 159, 45, 137, 50, 161, 41, 203, 53, 43, 158, 55, 57, 93, 37, 208, 60, 135, 99, 150, 64, 73, 7, 140, 68, 179, 201, 178, 72, 101, 110, 12, 77, 175, 195, 154, 81, 177, 162, 95, 86, 123, 239, 92, 91, 45, 153, 148, 96, 23, 154, 8, 102, 217, 247, 186, 107, 131, 195, 173, 113, 181, 25, 227, 119, 191, 34, 93, 126, 29, 35, 0, 0, 113, 77, 0, 0, 145, 156, 0, 0, 253, 38, 1, 0, 101, 12, 2, 0, 233, 119, 3, 0, 153, 162, 5, 0, 53, 214, 8, 0, 45, 112, 13, 0, 225, 228, 19, 0, 33, 195, 28, 0, 237, 183, 40, 0, 117, 146, 56, 0, 89, 72, 77, 0, 41, 250, 103, 0, 37, 248, 137, 0, 61, 199, 180, 0, 81, 38, 234, 0, 177, 19, 44, 1, 221, 210, 124, 1, 133, 242, 222, 1, 201, 82, 85, 2, 185, 43, 227, 2, 21, 20, 140, 3, 77, 8, 84, 4, 193, 113, 63, 5, 65, 46, 83, 6, 205, 151, 148, 7, 149, 140, 9, 9, 57, 119, 184, 10, 73, 87, 168, 12, 5, 202, 224, 14, 93, 19, 106, 17, 49, 39, 77, 20, 209, 178, 147, 23, 189, 38, 72, 27, 165, 192, 117, 31, 169, 149, 40, 36, 217, 156, 109, 41, 245, 185, 82, 47, 109, 200, 230, 53, 161, 166, 57, 61, 97, 65, 92, 69, 173, 159, 96, 78, 181, 238, 89, 88, 25, 142, 92, 99, 105, 28, 126, 111, 229, 131, 213, 124, 255, 189, 0, 0, 1, 168, 1, 0, 143, 107, 3, 0, 241, 158, 6, 0, 63, 35, 12, 0, 193, 61, 21, 0, 143, 182, 35, 0, 241, 252, 57, 0, 255, 81, 91, 0, 1, 250, 139, 0, 15, 117, 209, 0, 113, 191, 50, 1, 63, 154, 184, 1, 193, 220, 109, 2, 15, 207, 95, 3, 113, 142, 158, 4, 255, 123, 61, 6, 1, 182, 83, 8, 143, 156, 252, 10, 241, 97, 88, 14, 63, 167, 140, 18, 193, 37, 197, 23, 143, 101, 52, 30, 241, 129, 20, 38, 255, 251, 167, 47, 1, 156, 58, 59, 15, 98, 34, 73, 113, 134, 192, 89, 63, 138, 130, 109, 193, 88, 227, 132, 1, 14, 4, 0, 145, 33, 9, 0, 17, 44, 19, 0, 65, 238, 37, 0, 65, 79, 71, 0, 145, 67, 128, 0, 17, 247, 221, 0, 1, 70, 115, 1, 1, 146, 90, 2, 17, 1, 184, 3, 145, 53, 188, 5, 65, 143, 167, 8, 65, 6, 206, 12, 17, 178, 155, 18, 145, 15, 154, 26, 1, 26, 118, 37, 1, 76, 7, 52, 145, 158, 87, 71, 17, 157, 172, 96, 65, 166, 145, 129, 35, 81, 22, 0, 197, 158, 50, 0, 23, 185, 107, 0, 153, 246, 216, 0, 107, 137, 160, 1, 13, 196, 254, 2, 31, 1, 80, 5, 33, 217, 29, 9, 51, 108, 48, 15, 213, 162, 164, 24, 167, 103, 8, 39, 41, 253, 125, 60, 123, 181, 231, 91, 29, 119, 29, 137, 175, 160, 45, 201, 173, 142, 123, 0, 137, 230, 25, 1, 57, 150, 94, 2, 61, 22, 216, 4, 181, 99, 119, 9, 225, 40, 198, 17, 33, 3, 52, 32, 117, 72, 130, 56, 125, 87, 87, 96, 191, 91, 175, 2, 129, 216, 39, 6, 247, 132, 94, 13, 233, 254, 173, 27, 127, 139, 235, 54, 129, 183, 229, 104, 23, 3, 156, 193, 193, 12, 255, 14, 57, 106, 133, 34, 25, 238, 145, 75, 129, 120, 43, 158, 51, 225, 9, 84, 149, 139, 0, 0, 55, 152, 0, 0, 255, 165, 0, 0, 4, 181, 0, 0, 103, 197, 0, 0, 69, 215, 0, 0, 193, 234, 0, 0, 255, 255, 0, 0, 200, 22, 0, 0, 0, 0, 0, 0, 128, 187, 0, 0, 120, 0, 0, 0, 21, 0, 0, 0, 21, 0, 0, 0, 0, 154, 89, 63, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 128, 63, 56, 23, 0, 0, 3, 0, 0, 0, 8, 0, 0, 0, 120, 0, 0, 0, 11, 0, 0, 0, 104, 23, 0, 0, 80, 24, 0, 0, 128, 24, 0, 0, 128, 7, 0, 0, 3, 0, 0, 0, 96, 26, 0, 0, 152, 26, 0, 0, 208, 26, 0, 0, 8, 27, 0, 0, 64, 27, 0, 0, 136, 1, 0, 0, 96, 55, 0, 0, 56, 56, 0, 0, 192, 57, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 10, 0, 12, 0, 14, 0, 16, 0, 20, 0, 24, 0, 28, 0, 34, 0, 40, 0, 48, 0, 60, 0, 78, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 80, 75, 69, 63, 56, 49, 40, 34, 29, 20, 18, 10, 0, 0, 0, 0, 0, 0, 0, 0, 110, 100, 90, 84, 78, 71, 65, 58, 51, 45, 39, 32, 26, 20, 12, 0, 0, 0, 0, 0, 0, 118, 110, 103, 93, 86, 80, 75, 70, 65, 59, 53, 47, 40, 31, 23, 15, 4, 0, 0, 0, 0, 126, 119, 112, 104, 95, 89, 83, 78, 72, 66, 60, 54, 47, 39, 32, 25, 17, 12, 1, 0, 0, 134, 127, 120, 114, 103, 97, 91, 85, 78, 72, 66, 60, 54, 47, 41, 35, 29, 23, 16, 10, 1, 144, 137, 130, 124, 113, 107, 101, 95, 88, 82, 76, 70, 64, 57, 51, 45, 39, 33, 26, 15, 1, 152, 145, 138, 132, 123, 117, 111, 105, 98, 92, 86, 80, 74, 67, 61, 55, 49, 43, 36, 20, 1, 162, 155, 148, 142, 133, 127, 121, 115, 108, 102, 96, 90, 84, 77, 71, 65, 59, 53, 46, 30, 1, 172, 165, 158, 152, 143, 137, 131, 125, 118, 112, 106, 100, 94, 87, 81, 75, 69, 63, 56, 45, 20, 200, 200, 200, 200, 200, 200, 200, 200, 198, 193, 188, 183, 178, 173, 168, 163, 158, 153, 148, 129, 104, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 8, 0, 16, 0, 16, 0, 16, 0, 21, 0, 21, 0, 24, 0, 29, 0, 34, 0, 36, 0, 0, 0, 0, 0, 0, 0, 106, 28, 141, 56, 82, 187, 30, 58, 8, 105, 220, 58, 130, 237, 87, 59, 137, 99, 178, 59, 3, 42, 5, 60, 48, 220, 57, 60, 180, 62, 119, 60, 28, 163, 158, 60, 209, 242, 197, 60, 254, 134, 241, 60, 155, 171, 16, 61, 5, 173, 42, 61, 132, 194, 70, 61, 83, 230, 100, 61, 17, 137, 130, 61, 135, 159, 147, 61, 203, 178, 165, 61, 209, 190, 184, 61, 58, 191, 204, 61, 84, 175, 225, 61, 20, 138, 247, 61, 14, 37, 7, 62, 217, 244, 18, 62, 95, 49, 31, 62, 104, 215, 43, 62, 138, 227, 56, 62, 48, 82, 70, 62, 148, 31, 84, 62, 191, 71, 98, 62, 142, 198, 112, 62, 176, 151, 127, 62, 82, 91, 135, 62, 96, 15, 143, 62, 152, 229, 150, 62, 121, 219, 158, 62, 112, 238, 166, 62, 216, 27, 175, 62, 251, 96, 183, 62, 17, 187, 191, 62, 70, 39, 200, 62, 183, 162, 208, 62, 120, 42, 217, 62, 148, 187, 225, 62, 12, 83, 234, 62, 222, 237, 242, 62, 6, 137, 251, 62, 190, 16, 2, 63, 31, 90, 6, 63, 36, 159, 10, 63, 80, 222, 14, 63, 43, 22, 19, 63, 65, 69, 23, 63, 37, 106, 27, 63, 115, 131, 31, 63, 206, 143, 35, 63, 230, 141, 39, 63, 116, 124, 43, 63, 63, 90, 47, 63, 25, 38, 51, 63, 231, 222, 54, 63, 153, 131, 58, 63, 51, 19, 62, 63, 197, 140, 65, 63, 119, 239, 68, 63, 127, 58, 72, 63, 39, 109, 75, 63, 206, 134, 78, 63, 229, 134, 81, 63, 241, 108, 84, 63, 142, 56, 87, 63, 105, 233, 89, 63, 69, 127, 92, 63, 250, 249, 94, 63, 115, 89, 97, 63, 175, 157, 99, 63, 193, 198, 101, 63, 207, 212, 103, 63, 17, 200, 105, 63, 210, 160, 107, 63, 110, 95, 109, 63, 80, 4, 111, 63, 244, 143, 112, 63, 230, 2, 114, 63, 189, 93, 115, 63, 31, 161, 116, 63, 191, 205, 117, 63, 87, 228, 118, 63, 176, 229, 119, 63, 151, 210, 120, 63, 227, 171, 121, 63, 115, 114, 122, 63, 39, 39, 123, 63, 231, 202, 123, 63, 157, 94, 124, 63, 53, 227, 124, 63, 156, 89, 125, 63, 189, 194, 125, 63, 134, 31, 126, 63, 222, 112, 126, 63, 171, 183, 126, 63, 207, 244, 126, 63, 38, 41, 127, 63, 134, 85, 127, 63, 190, 122, 127, 63, 150, 153, 127, 63, 204, 178, 127, 63, 20, 199, 127, 63, 28, 215, 127, 63, 130, 227, 127, 63, 221, 236, 127, 63, 182, 243, 127, 63, 138, 248, 127, 63, 200, 251, 127, 63, 214, 253, 127, 63, 7, 255, 127, 63, 165, 255, 127, 63, 232, 255, 127, 63, 253, 255, 127, 63, 0, 0, 128, 63, 224, 1, 0, 0, 135, 136, 8, 59, 255, 255, 255, 255, 5, 0, 96, 0, 3, 0, 32, 0, 4, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 76, 0, 0, 224, 58, 0, 0, 0, 0, 0, 0, 240, 0, 0, 0, 137, 136, 136, 59, 1, 0, 0, 0, 5, 0, 48, 0, 3, 0, 16, 0, 4, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 208, 74, 0, 0, 224, 58, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0, 136, 136, 8, 60, 2, 0, 0, 0, 5, 0, 24, 0, 3, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 224, 73, 0, 0, 224, 58, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 137, 136, 136, 60, 3, 0, 0, 0, 5, 0, 12, 0, 3, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 104, 58, 0, 0, 224, 58, 0, 0, 0, 0, 0, 0, 255, 255, 127, 63, 142, 255, 127, 63, 106, 254, 127, 63, 147, 252, 127, 63, 7, 250, 127, 63, 200, 246, 127, 63, 214, 242, 127, 63, 48, 238, 127, 63, 214, 232, 127, 63, 200, 226, 127, 63, 7, 220, 127, 63, 147, 212, 127, 63, 107, 204, 127, 63, 143, 195, 127, 63, 0, 186, 127, 63, 189, 175, 127, 63, 199, 164, 127, 63, 29, 153, 127, 63, 192, 140, 127, 63, 176, 127, 127, 63, 236, 113, 127, 63, 118, 99, 127, 63, 75, 84, 127, 63, 110, 68, 127, 63, 222, 51, 127, 63, 154, 34, 127, 63, 163, 16, 127, 63, 250, 253, 126, 63, 157, 234, 126, 63, 141, 214, 126, 63, 203, 193, 126, 63, 86, 172, 126, 63, 46, 150, 126, 63, 83, 127, 126, 63, 198, 103, 126, 63, 134, 79, 126, 63, 148, 54, 126, 63, 239, 28, 126, 63, 152, 2, 126, 63, 143, 231, 125, 63, 211, 203, 125, 63, 102, 175, 125, 63, 70, 146, 125, 63, 116, 116, 125, 63, 241, 85, 125, 63, 188, 54, 125, 63, 213, 22, 125, 63, 60, 246, 124, 63, 242, 212, 124, 63, 246, 178, 124, 63, 73, 144, 124, 63, 235, 108, 124, 63, 219, 72, 124, 63, 27, 36, 124, 63, 169, 254, 123, 63, 135, 216, 123, 63, 180, 177, 123, 63, 48, 138, 123, 63, 252, 97, 123, 63, 23, 57, 123, 63, 130, 15, 123, 63, 61, 229, 122, 63, 72, 186, 122, 63, 162, 142, 122, 63, 77, 98, 122, 63, 72, 53, 122, 63, 148, 7, 122, 63, 48, 217, 121, 63, 29, 170, 121, 63, 90, 122, 121, 63, 233, 73, 121, 63, 200, 24, 121, 63, 249, 230, 120, 63, 123, 180, 120, 63, 78, 129, 120, 63, 115, 77, 120, 63, 234, 24, 120, 63, 178, 227, 119, 63, 205, 173, 119, 63, 58, 119, 119, 63, 249, 63, 119, 63, 10, 8, 119, 63, 110, 207, 118, 63, 37, 150, 118, 63, 47, 92, 118, 63, 140, 33, 118, 63, 60, 230, 117, 63, 64, 170, 117, 63, 151, 109, 117, 63, 66, 48, 117, 63, 65, 242, 116, 63, 148, 179, 116, 63, 59, 116, 116, 63, 55, 52, 116, 63, 135, 243, 115, 63, 44, 178, 115, 63, 38, 112, 115, 63, 118, 45, 115, 63, 26, 234, 114, 63, 20, 166, 114, 63, 100, 97, 114, 63, 10, 28, 114, 63, 5, 214, 113, 63, 87, 143, 113, 63, 0, 72, 113, 63, 255, 255, 112, 63, 85, 183, 112, 63, 2, 110, 112, 63, 6, 36, 112, 63, 98, 217, 111, 63, 21, 142, 111, 63, 32, 66, 111, 63, 132, 245, 110, 63, 63, 168, 110, 63, 83, 90, 110, 63, 192, 11, 110, 63, 134, 188, 109, 63, 165, 108, 109, 63, 29, 28, 109, 63, 239, 202, 108, 63, 27, 121, 108, 63, 161, 38, 108, 63, 128, 211, 107, 63, 187, 127, 107, 63, 80, 43, 107, 63, 64, 214, 106, 63, 140, 128, 106, 63, 50, 42, 106, 63, 53, 211, 105, 63, 147, 123, 105, 63, 77, 35, 105, 63, 100, 202, 104, 63, 216, 112, 104, 63, 168, 22, 104, 63, 213, 187, 103, 63, 96, 96, 103, 63, 72, 4, 103, 63, 143, 167, 102, 63, 51, 74, 102, 63, 54, 236, 101, 63, 151, 141, 101, 63, 87, 46, 101, 63, 119, 206, 100, 63, 245, 109, 100, 63, 212, 12, 100, 63, 18, 171, 99, 63, 177, 72, 99, 63, 176, 229, 98, 63, 16, 130, 98, 63, 209, 29, 98, 63, 243, 184, 97, 63, 119, 83, 97, 63, 92, 237, 96, 63, 164, 134, 96, 63, 78, 31, 96, 63, 91, 183, 95, 63, 203, 78, 95, 63, 158, 229, 94, 63, 213, 123, 94, 63, 112, 17, 94, 63, 110, 166, 93, 63, 210, 58, 93, 63, 154, 206, 92, 63, 198, 97, 92, 63, 89, 244, 91, 63, 81, 134, 91, 63, 174, 23, 91, 63, 114, 168, 90, 63, 157, 56, 90, 63, 46, 200, 89, 63, 39, 87, 89, 63, 135, 229, 88, 63, 79, 115, 88, 63, 127, 0, 88, 63, 23, 141, 87, 63, 24, 25, 87, 63, 130, 164, 86, 63, 86, 47, 86, 63, 147, 185, 85, 63, 58, 67, 85, 63, 75, 204, 84, 63, 199, 84, 84, 63, 174, 220, 83, 63, 1, 100, 83, 63, 191, 234, 82, 63, 233, 112, 82, 63, 127, 246, 81, 63, 130, 123, 81, 63, 242, 255, 80, 63, 207, 131, 80, 63, 26, 7, 80, 63, 210, 137, 79, 63, 250, 11, 79, 63, 144, 141, 78, 63, 148, 14, 78, 63, 9, 143, 77, 63, 237, 14, 77, 63, 65, 142, 76, 63, 5, 13, 76, 63, 59, 139, 75, 63, 225, 8, 75, 63, 249, 133, 74, 63, 131, 2, 74, 63, 127, 126, 73, 63, 238, 249, 72, 63, 207, 116, 72, 63, 36, 239, 71, 63, 237, 104, 71, 63, 41, 226, 70, 63, 218, 90, 70, 63, 0, 211, 69, 63, 155, 74, 69, 63, 172, 193, 68, 63, 50, 56, 68, 63, 47, 174, 67, 63, 162, 35, 67, 63, 141, 152, 66, 63, 239, 12, 66, 63, 200, 128, 65, 63, 26, 244, 64, 63, 229, 102, 64, 63, 40, 217, 63, 63, 229, 74, 63, 63, 27, 188, 62, 63, 204, 44, 62, 63, 247, 156, 61, 63, 157, 12, 61, 63, 190, 123, 60, 63, 92, 234, 59, 63, 117, 88, 59, 63, 10, 198, 58, 63, 29, 51, 58, 63, 173, 159, 57, 63, 187, 11, 57, 63, 71, 119, 56, 63, 81, 226, 55, 63, 218, 76, 55, 63, 227, 182, 54, 63, 107, 32, 54, 63, 116, 137, 53, 63, 253, 241, 52, 63, 7, 90, 52, 63, 147, 193, 51, 63, 160, 40, 51, 63, 48, 143, 50, 63, 66, 245, 49, 63, 216, 90, 49, 63, 241, 191, 48, 63, 142, 36, 48, 63, 175, 136, 47, 63, 85, 236, 46, 63, 129, 79, 46, 63, 50, 178, 45, 63, 105, 20, 45, 63, 39, 118, 44, 63, 107, 215, 43, 63, 55, 56, 43, 63, 139, 152, 42, 63, 103, 248, 41, 63, 204, 87, 41, 63, 186, 182, 40, 63, 50, 21, 40, 63, 51, 115, 39, 63, 191, 208, 38, 63, 214, 45, 38, 63, 121, 138, 37, 63, 167, 230, 36, 63, 97, 66, 36, 63, 169, 157, 35, 63, 125, 248, 34, 63, 223, 82, 34, 63, 207, 172, 33, 63, 77, 6, 33, 63, 91, 95, 32, 63, 248, 183, 31, 63, 37, 16, 31, 63, 226, 103, 30, 63, 48, 191, 29, 63, 16, 22, 29, 63, 129, 108, 28, 63, 132, 194, 27, 63, 26, 24, 27, 63, 67, 109, 26, 63, 0, 194, 25, 63, 81, 22, 25, 63, 54, 106, 24, 63, 177, 189, 23, 63, 193, 16, 23, 63, 103, 99, 22, 63, 163, 181, 21, 63, 118, 7, 21, 63, 225, 88, 20, 63, 228, 169, 19, 63, 127, 250, 18, 63, 179, 74, 18, 63, 128, 154, 17, 63, 231, 233, 16, 63, 232, 56, 16, 63, 132, 135, 15, 63, 187, 213, 14, 63, 142, 35, 14, 63, 254, 112, 13, 63, 10, 190, 12, 63, 179, 10, 12, 63, 250, 86, 11, 63, 223, 162, 10, 63, 99, 238, 9, 63, 134, 57, 9, 63, 73, 132, 8, 63, 172, 206, 7, 63, 175, 24, 7, 63, 84, 98, 6, 63, 155, 171, 5, 63, 131, 244, 4, 63, 15, 61, 4, 63, 61, 133, 3, 63, 15, 205, 2, 63, 134, 20, 2, 63, 161, 91, 1, 63, 97, 162, 0, 63, 143, 209, 255, 62, 167, 93, 254, 62, 14, 233, 252, 62, 194, 115, 251, 62, 198, 253, 249, 62, 27, 135, 248, 62, 193, 15, 247, 62, 186, 151, 245, 62, 6, 31, 244, 62, 168, 165, 242, 62, 158, 43, 241, 62, 236, 176, 239, 62, 145, 53, 238, 62, 144, 185, 236, 62, 232, 60, 235, 62, 154, 191, 233, 62, 169, 65, 232, 62, 21, 195, 230, 62, 223, 67, 229, 62, 8, 196, 227, 62, 145, 67, 226, 62, 124, 194, 224, 62, 200, 64, 223, 62, 120, 190, 221, 62, 140, 59, 220, 62, 6, 184, 218, 62, 230, 51, 217, 62, 46, 175, 215, 62, 223, 41, 214, 62, 249, 163, 212, 62, 125, 29, 211, 62, 110, 150, 209, 62, 204, 14, 208, 62, 151, 134, 206, 62, 210, 253, 204, 62, 125, 116, 203, 62, 153, 234, 201, 62, 39, 96, 200, 62, 40, 213, 198, 62, 159, 73, 197, 62, 138, 189, 195, 62, 236, 48, 194, 62, 198, 163, 192, 62, 25, 22, 191, 62, 230, 135, 189, 62, 45, 249, 187, 62, 241, 105, 186, 62, 50, 218, 184, 62, 241, 73, 183, 62, 47, 185, 181, 62, 238, 39, 180, 62, 47, 150, 178, 62, 242, 3, 177, 62, 57, 113, 175, 62, 4, 222, 173, 62, 86, 74, 172, 62, 47, 182, 170, 62, 144, 33, 169, 62, 122, 140, 167, 62, 239, 246, 165, 62, 239, 96, 164, 62, 124, 202, 162, 62, 151, 51, 161, 62, 64, 156, 159, 62, 122, 4, 158, 62, 68, 108, 156, 62, 161, 211, 154, 62, 145, 58, 153, 62, 22, 161, 151, 62, 48, 7, 150, 62, 225, 108, 148, 62, 41, 210, 146, 62, 11, 55, 145, 62, 135, 155, 143, 62, 158, 255, 141, 62, 81, 99, 140, 62, 162, 198, 138, 62, 145, 41, 137, 62, 32, 140, 135, 62, 80, 238, 133, 62, 34, 80, 132, 62, 151, 177, 130, 62, 176, 18, 129, 62, 222, 230, 126, 62, 169, 167, 123, 62, 195, 103, 120, 62, 47, 39, 117, 62, 238, 229, 113, 62, 4, 164, 110, 62, 115, 97, 107, 62, 60, 30, 104, 62, 98, 218, 100, 62, 232, 149, 97, 62, 207, 80, 94, 62, 26, 11, 91, 62, 204, 196, 87, 62, 230, 125, 84, 62, 107, 54, 81, 62, 93, 238, 77, 62, 191, 165, 74, 62, 146, 92, 71, 62, 218, 18, 68, 62, 151, 200, 64, 62, 206, 125, 61, 62, 128, 50, 58, 62, 174, 230, 54, 62, 93, 154, 51, 62, 141, 77, 48, 62, 66, 0, 45, 62, 125, 178, 41, 62, 66, 100, 38, 62, 145, 21, 35, 62, 110, 198, 31, 62, 219, 118, 28, 62, 218, 38, 25, 62, 109, 214, 21, 62, 152, 133, 18, 62, 91, 52, 15, 62, 186, 226, 11, 62, 183, 144, 8, 62, 84, 62, 5, 62, 148, 235, 1, 62, 240, 48, 253, 61, 6, 138, 246, 61, 113, 226, 239, 61, 51, 58, 233, 61, 79, 145, 226, 61, 207, 231, 219, 61, 181, 61, 213, 61, 3, 147, 206, 61, 192, 231, 199, 61, 242, 59, 193, 61, 156, 143, 186, 61, 195, 226, 179, 61, 108, 53, 173, 61, 155, 135, 166, 61, 85, 217, 159, 61, 159, 42, 153, 61, 126, 123, 146, 61, 246, 203, 139, 61, 11, 28, 133, 61, 135, 215, 124, 61, 70, 118, 111, 61, 93, 20, 98, 61, 214, 177, 84, 61, 185, 78, 71, 61, 16, 235, 57, 61, 229, 134, 44, 61, 64, 34, 31, 61, 44, 189, 17, 61, 178, 87, 4, 61, 181, 227, 237, 60, 96, 23, 211, 60, 118, 74, 184, 60, 11, 125, 157, 60, 50, 175, 130, 60, 250, 193, 79, 60, 254, 36, 26, 60, 42, 15, 201, 59, 153, 167, 59, 59, 46, 125, 214, 185, 210, 70, 113, 187, 171, 222, 227, 187, 166, 140, 39, 188, 129, 41, 93, 188, 225, 98, 137, 188, 160, 48, 164, 188, 236, 253, 190, 188, 179, 202, 217, 188, 224, 150, 244, 188, 49, 177, 7, 189, 147, 22, 21, 189, 140, 123, 34, 189, 19, 224, 47, 189, 30, 68, 61, 189, 165, 167, 74, 189, 157, 10, 88, 189, 254, 108, 101, 189, 190, 206, 114, 189, 234, 23, 128, 189, 27, 200, 134, 189, 237, 119, 141, 189, 92, 39, 148, 189, 99, 214, 154, 189, 253, 132, 161, 189, 38, 51, 168, 189, 217, 224, 174, 189, 17, 142, 181, 189, 202, 58, 188, 189, 254, 230, 194, 189, 170, 146, 201, 189, 200, 61, 208, 189, 84, 232, 214, 189, 74, 146, 221, 189, 164, 59, 228, 189, 93, 228, 234, 189, 114, 140, 241, 189, 221, 51, 248, 189, 154, 218, 254, 189, 82, 192, 2, 190, 252, 18, 6, 190, 71, 101, 9, 190, 50, 183, 12, 190, 186, 8, 16, 190, 221, 89, 19, 190, 152, 170, 22, 190, 234, 250, 25, 190, 208, 74, 29, 190, 71, 154, 32, 190, 78, 233, 35, 190, 225, 55, 39, 190, 0, 134, 42, 190, 166, 211, 45, 190, 211, 32, 49, 190, 131, 109, 52, 190, 181, 185, 55, 190, 101, 5, 59, 190, 147, 80, 62, 190, 58, 155, 65, 190, 90, 229, 68, 190, 240, 46, 72, 190, 249, 119, 75, 190, 116, 192, 78, 190, 93, 8, 82, 190, 179, 79, 85, 190, 115, 150, 88, 190, 156, 220, 91, 190, 42, 34, 95, 190, 27, 103, 98, 190, 109, 171, 101, 190, 31, 239, 104, 190, 44, 50, 108, 190, 148, 116, 111, 190, 84, 182, 114, 190, 106, 247, 117, 190, 211, 55, 121, 190, 141, 119, 124, 190, 150, 182, 127, 190, 117, 122, 129, 190, 69, 25, 131, 190, 185, 183, 132, 190, 208, 85, 134, 190, 136, 243, 135, 190, 225, 144, 137, 190, 218, 45, 139, 190, 112, 202, 140, 190, 164, 102, 142, 190, 116, 2, 144, 190, 223, 157, 145, 190, 228, 56, 147, 190, 129, 211, 148, 190, 182, 109, 150, 190, 129, 7, 152, 190, 226, 160, 153, 190, 215, 57, 155, 190, 95, 210, 156, 190, 121, 106, 158, 190, 35, 2, 160, 190, 94, 153, 161, 190, 38, 48, 163, 190, 125, 198, 164, 190, 96, 92, 166, 190, 206, 241, 167, 190, 198, 134, 169, 190, 71, 27, 171, 190, 80, 175, 172, 190, 224, 66, 174, 190, 245, 213, 175, 190, 143, 104, 177, 190, 173, 250, 178, 190, 77, 140, 180, 190, 110, 29, 182, 190, 16, 174, 183, 190, 48, 62, 185, 190, 207, 205, 186, 190, 234, 92, 188, 190, 130, 235, 189, 190, 148, 121, 191, 190, 31, 7, 193, 190, 35, 148, 194, 190, 159, 32, 196, 190, 145, 172, 197, 190, 248, 55, 199, 190, 211, 194, 200, 190, 34, 77, 202, 190, 226, 214, 203, 190, 19, 96, 205, 190, 181, 232, 206, 190, 197, 112, 208, 190, 66, 248, 209, 190, 45, 127, 211, 190, 131, 5, 213, 190, 67, 139, 214, 190, 109, 16, 216, 190, 255, 148, 217, 190, 249, 24, 219, 190, 89, 156, 220, 190, 29, 31, 222, 190, 70, 161, 223, 190, 211, 34, 225, 190, 193, 163, 226, 190, 16, 36, 228, 190, 190, 163, 229, 190, 204, 34, 231, 190, 56, 161, 232, 190, 0, 31, 234, 190, 36, 156, 235, 190, 162, 24, 237, 190, 122, 148, 238, 190, 171, 15, 240, 190, 51, 138, 241, 190, 18, 4, 243, 190, 70, 125, 244, 190, 207, 245, 245, 190, 170, 109, 247, 190, 217, 228, 248, 190, 88, 91, 250, 190, 40, 209, 251, 190, 71, 70, 253, 190, 181, 186, 254, 190, 56, 23, 0, 191, 187, 208, 0, 191, 228, 137, 1, 191, 178, 66, 2, 191, 37, 251, 2, 191, 59, 179, 3, 191, 246, 106, 4, 191, 83, 34, 5, 191, 83, 217, 5, 191, 245, 143, 6, 191, 56, 70, 7, 191, 29, 252, 7, 191, 162, 177, 8, 191, 199, 102, 9, 191, 140, 27, 10, 191, 240, 207, 10, 191, 243, 131, 11, 191, 147, 55, 12, 191, 209, 234, 12, 191, 172, 157, 13, 191, 36, 80, 14, 191, 56, 2, 15, 191, 232, 179, 15, 191, 50, 101, 16, 191, 24, 22, 17, 191, 151, 198, 17, 191, 176, 118, 18, 191, 99, 38, 19, 191, 174, 213, 19, 191, 145, 132, 20, 191, 13, 51, 21, 191, 31, 225, 21, 191, 200, 142, 22, 191, 8, 60, 23, 191, 221, 232, 23, 191, 72, 149, 24, 191, 72, 65, 25, 191, 220, 236, 25, 191, 4, 152, 26, 191, 192, 66, 27, 191, 15, 237, 27, 191, 240, 150, 28, 191, 99, 64, 29, 191, 104, 233, 29, 191, 254, 145, 30, 191, 37, 58, 31, 191, 220, 225, 31, 191, 35, 137, 32, 191, 250, 47, 33, 191, 95, 214, 33, 191, 82, 124, 34, 191, 212, 33, 35, 191, 227, 198, 35, 191, 127, 107, 36, 191, 167, 15, 37, 191, 92, 179, 37, 191, 157, 86, 38, 191, 104, 249, 38, 191, 191, 155, 39, 191, 160, 61, 40, 191, 11, 223, 40, 191, 255, 127, 41, 191, 125, 32, 42, 191, 131, 192, 42, 191, 17, 96, 43, 191, 39, 255, 43, 191, 196, 157, 44, 191, 232, 59, 45, 191, 146, 217, 45, 191, 195, 118, 46, 191, 121, 19, 47, 191, 180, 175, 47, 191, 115, 75, 48, 191, 183, 230, 48, 191, 127, 129, 49, 191, 203, 27, 50, 191, 153, 181, 50, 191, 234, 78, 51, 191, 189, 231, 51, 191, 18, 128, 52, 191, 232, 23, 53, 191, 63, 175, 53, 191, 22, 70, 54, 191, 110, 220, 54, 191, 69, 114, 55, 191, 156, 7, 56, 191, 113, 156, 56, 191, 197, 48, 57, 191, 150, 196, 57, 191, 230, 87, 58, 191, 178, 234, 58, 191, 252, 124, 59, 191, 194, 14, 60, 191, 3, 160, 60, 191, 193, 48, 61, 191, 250, 192, 61, 191, 173, 80, 62, 191, 219, 223, 62, 191, 131, 110, 63, 191, 165, 252, 63, 191, 64, 138, 64, 191, 83, 23, 65, 191, 224, 163, 65, 191, 228, 47, 66, 191, 96, 187, 66, 191, 83, 70, 67, 191, 190, 208, 67, 191, 158, 90, 68, 191, 246, 227, 68, 191, 194, 108, 69, 191, 5, 245, 69, 191, 188, 124, 70, 191, 232, 3, 71, 191, 137, 138, 71, 191, 157, 16, 72, 191, 37, 150, 72, 191, 32, 27, 73, 191, 142, 159, 73, 191, 111, 35, 74, 191, 193, 166, 74, 191, 134, 41, 75, 191, 188, 171, 75, 191, 99, 45, 76, 191, 122, 174, 76, 191, 2, 47, 77, 191, 250, 174, 77, 191, 98, 46, 78, 191, 57, 173, 78, 191, 126, 43, 79, 191, 51, 169, 79, 191, 85, 38, 80, 191, 230, 162, 80, 191, 228, 30, 81, 191, 80, 154, 81, 191, 40, 21, 82, 191, 109, 143, 82, 191, 30, 9, 83, 191, 59, 130, 83, 191, 195, 250, 83, 191, 183, 114, 84, 191, 22, 234, 84, 191, 223, 96, 85, 191, 18, 215, 85, 191, 176, 76, 86, 191, 183, 193, 86, 191, 39, 54, 87, 191, 0, 170, 87, 191, 66, 29, 88, 191, 236, 143, 88, 191, 254, 1, 89, 191, 120, 115, 89, 191, 89, 228, 89, 191, 162, 84, 90, 191, 81, 196, 90, 191, 102, 51, 91, 191, 226, 161, 91, 191, 195, 15, 92, 191, 10, 125, 92, 191, 183, 233, 92, 191, 200, 85, 93, 191, 62, 193, 93, 191, 24, 44, 94, 191, 87, 150, 94, 191, 249, 255, 94, 191, 255, 104, 95, 191, 104, 209, 95, 191, 51, 57, 96, 191, 98, 160, 96, 191, 243, 6, 97, 191, 229, 108, 97, 191, 58, 210, 97, 191, 240, 54, 98, 191, 8, 155, 98, 191, 128, 254, 98, 191, 89, 97, 99, 191, 146, 195, 99, 191, 44, 37, 100, 191, 37, 134, 100, 191], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
allocate([126, 230, 100, 191, 55, 70, 101, 191, 78, 165, 101, 191, 197, 3, 102, 191, 154, 97, 102, 191, 205, 190, 102, 191, 94, 27, 103, 191, 77, 119, 103, 191, 154, 210, 103, 191, 68, 45, 104, 191, 75, 135, 104, 191, 174, 224, 104, 191, 111, 57, 105, 191, 139, 145, 105, 191, 4, 233, 105, 191, 217, 63, 106, 191, 9, 150, 106, 191, 148, 235, 106, 191, 123, 64, 107, 191, 188, 148, 107, 191, 89, 232, 107, 191, 79, 59, 108, 191, 160, 141, 108, 191, 75, 223, 108, 191, 79, 48, 109, 191, 173, 128, 109, 191, 101, 208, 109, 191, 117, 31, 110, 191, 223, 109, 110, 191, 161, 187, 110, 191, 187, 8, 111, 191, 46, 85, 111, 191, 248, 160, 111, 191, 27, 236, 111, 191, 149, 54, 112, 191, 103, 128, 112, 191, 144, 201, 112, 191, 15, 18, 113, 191, 230, 89, 113, 191, 19, 161, 113, 191, 151, 231, 113, 191, 113, 45, 114, 191, 160, 114, 114, 191, 38, 183, 114, 191, 1, 251, 114, 191, 50, 62, 115, 191, 184, 128, 115, 191, 148, 194, 115, 191, 196, 3, 116, 191, 73, 68, 116, 191, 34, 132, 116, 191, 80, 195, 116, 191, 210, 1, 117, 191, 168, 63, 117, 191, 210, 124, 117, 191, 80, 185, 117, 191, 33, 245, 117, 191, 69, 48, 118, 191, 189, 106, 118, 191, 136, 164, 118, 191, 166, 221, 118, 191, 22, 22, 119, 191, 217, 77, 119, 191, 239, 132, 119, 191, 87, 187, 119, 191, 17, 241, 119, 191, 29, 38, 120, 191, 122, 90, 120, 191, 42, 142, 120, 191, 43, 193, 120, 191, 125, 243, 120, 191, 33, 37, 121, 191, 22, 86, 121, 191, 92, 134, 121, 191, 242, 181, 121, 191, 218, 228, 121, 191, 18, 19, 122, 191, 154, 64, 122, 191, 115, 109, 122, 191, 157, 153, 122, 191, 22, 197, 122, 191, 223, 239, 122, 191, 248, 25, 123, 191, 97, 67, 123, 191, 26, 108, 123, 191, 34, 148, 123, 191, 122, 187, 123, 191, 32, 226, 123, 191, 23, 8, 124, 191, 92, 45, 124, 191, 240, 81, 124, 191, 211, 117, 124, 191, 5, 153, 124, 191, 134, 187, 124, 191, 85, 221, 124, 191, 115, 254, 124, 191, 223, 30, 125, 191, 154, 62, 125, 191, 163, 93, 125, 191, 250, 123, 125, 191, 159, 153, 125, 191, 146, 182, 125, 191, 211, 210, 125, 191, 98, 238, 125, 191, 63, 9, 126, 191, 105, 35, 126, 191, 225, 60, 126, 191, 167, 85, 126, 191, 186, 109, 126, 191, 27, 133, 126, 191, 201, 155, 126, 191, 196, 177, 126, 191, 13, 199, 126, 191, 162, 219, 126, 191, 133, 239, 126, 191, 181, 2, 127, 191, 50, 21, 127, 191, 252, 38, 127, 191, 19, 56, 127, 191, 118, 72, 127, 191, 39, 88, 127, 191, 36, 103, 127, 191, 110, 117, 127, 191, 5, 131, 127, 191, 232, 143, 127, 191, 25, 156, 127, 191, 149, 167, 127, 191, 95, 178, 127, 191, 116, 188, 127, 191, 215, 197, 127, 191, 133, 206, 127, 191, 129, 214, 127, 191, 200, 221, 127, 191, 93, 228, 127, 191, 61, 234, 127, 191, 106, 239, 127, 191, 227, 243, 127, 191, 169, 247, 127, 191, 187, 250, 127, 191, 25, 253, 127, 191, 196, 254, 127, 191, 187, 255, 127, 191, 250, 255, 127, 63, 57, 254, 127, 63, 169, 249, 127, 63, 75, 242, 127, 63, 30, 232, 127, 63, 35, 219, 127, 63, 89, 203, 127, 63, 193, 184, 127, 63, 91, 163, 127, 63, 40, 139, 127, 63, 39, 112, 127, 63, 90, 82, 127, 63, 191, 49, 127, 63, 88, 14, 127, 63, 37, 232, 126, 63, 38, 191, 126, 63, 92, 147, 126, 63, 200, 100, 126, 63, 105, 51, 126, 63, 65, 255, 125, 63, 79, 200, 125, 63, 150, 142, 125, 63, 20, 82, 125, 63, 203, 18, 125, 63, 188, 208, 124, 63, 231, 139, 124, 63, 77, 68, 124, 63, 239, 249, 123, 63, 205, 172, 123, 63, 233, 92, 123, 63, 67, 10, 123, 63, 221, 180, 122, 63, 182, 92, 122, 63, 209, 1, 122, 63, 46, 164, 121, 63, 206, 67, 121, 63, 178, 224, 120, 63, 220, 122, 120, 63, 76, 18, 120, 63, 4, 167, 119, 63, 4, 57, 119, 63, 79, 200, 118, 63, 228, 84, 118, 63, 198, 222, 117, 63, 246, 101, 117, 63, 117, 234, 116, 63, 68, 108, 116, 63, 101, 235, 115, 63, 218, 103, 115, 63, 163, 225, 114, 63, 194, 88, 114, 63, 57, 205, 113, 63, 9, 63, 113, 63, 52, 174, 112, 63, 187, 26, 112, 63, 160, 132, 111, 63, 228, 235, 110, 63, 138, 80, 110, 63, 147, 178, 109, 63, 1, 18, 109, 63, 213, 110, 108, 63, 17, 201, 107, 63, 183, 32, 107, 63, 201, 117, 106, 63, 73, 200, 105, 63, 57, 24, 105, 63, 155, 101, 104, 63, 111, 176, 103, 63, 186, 248, 102, 63, 124, 62, 102, 63, 184, 129, 101, 63, 111, 194, 100, 63, 164, 0, 100, 63, 90, 60, 99, 63, 145, 117, 98, 63, 76, 172, 97, 63, 142, 224, 96, 63, 89, 18, 96, 63, 174, 65, 95, 63, 145, 110, 94, 63, 3, 153, 93, 63, 8, 193, 92, 63, 160, 230, 91, 63, 207, 9, 91, 63, 152, 42, 90, 63, 251, 72, 89, 63, 253, 100, 88, 63, 159, 126, 87, 63, 229, 149, 86, 63, 208, 170, 85, 63, 99, 189, 84, 63, 161, 205, 83, 63, 140, 219, 82, 63, 39, 231, 81, 63, 117, 240, 80, 63, 121, 247, 79, 63, 52, 252, 78, 63, 171, 254, 77, 63, 223, 254, 76, 63, 212, 252, 75, 63, 140, 248, 74, 63, 10, 242, 73, 63, 82, 233, 72, 63, 101, 222, 71, 63, 71, 209, 70, 63, 251, 193, 69, 63, 132, 176, 68, 63, 229, 156, 67, 63, 32, 135, 66, 63, 58, 111, 65, 63, 52, 85, 64, 63, 19, 57, 63, 63, 216, 26, 62, 63, 136, 250, 60, 63, 38, 216, 59, 63, 180, 179, 58, 63, 54, 141, 57, 63, 175, 100, 56, 63, 34, 58, 55, 63, 147, 13, 54, 63, 5, 223, 52, 63, 124, 174, 51, 63, 249, 123, 50, 63, 130, 71, 49, 63, 25, 17, 48, 63, 194, 216, 46, 63, 127, 158, 45, 63, 86, 98, 44, 63, 72, 36, 43, 63, 90, 228, 41, 63, 144, 162, 40, 63, 235, 94, 39, 63, 113, 25, 38, 63, 37, 210, 36, 63, 9, 137, 35, 63, 35, 62, 34, 63, 117, 241, 32, 63, 4, 163, 31, 63, 210, 82, 30, 63, 228, 0, 29, 63, 61, 173, 27, 63, 225, 87, 26, 63, 211, 0, 25, 63, 25, 168, 23, 63, 180, 77, 22, 63, 170, 241, 20, 63, 253, 147, 19, 63, 178, 52, 18, 63, 204, 211, 16, 63, 80, 113, 15, 63, 66, 13, 14, 63, 164, 167, 12, 63, 124, 64, 11, 63, 205, 215, 9, 63, 154, 109, 8, 63, 233, 1, 7, 63, 189, 148, 5, 63, 25, 38, 4, 63, 3, 182, 2, 63, 126, 68, 1, 63, 28, 163, 255, 62, 110, 186, 252, 62, 250, 206, 249, 62, 202, 224, 246, 62, 228, 239, 243, 62, 81, 252, 240, 62, 26, 6, 238, 62, 71, 13, 235, 62, 224, 17, 232, 62, 237, 19, 229, 62, 119, 19, 226, 62, 135, 16, 223, 62, 36, 11, 220, 62, 88, 3, 217, 62, 42, 249, 213, 62, 164, 236, 210, 62, 205, 221, 207, 62, 175, 204, 204, 62, 82, 185, 201, 62, 191, 163, 198, 62, 254, 139, 195, 62, 24, 114, 192, 62, 22, 86, 189, 62, 0, 56, 186, 62, 224, 23, 183, 62, 189, 245, 179, 62, 161, 209, 176, 62, 149, 171, 173, 62, 162, 131, 170, 62, 207, 89, 167, 62, 39, 46, 164, 62, 178, 0, 161, 62, 121, 209, 157, 62, 133, 160, 154, 62, 223, 109, 151, 62, 143, 57, 148, 62, 160, 3, 145, 62, 26, 204, 141, 62, 5, 147, 138, 62, 107, 88, 135, 62, 86, 28, 132, 62, 205, 222, 128, 62, 182, 63, 123, 62, 16, 191, 116, 62, 187, 59, 110, 62, 201, 181, 103, 62, 77, 45, 97, 62, 89, 162, 90, 62, 255, 20, 84, 62, 81, 133, 77, 62, 99, 243, 70, 62, 70, 95, 64, 62, 13, 201, 57, 62, 202, 48, 51, 62, 144, 150, 44, 62, 114, 250, 37, 62, 130, 92, 31, 62, 210, 188, 24, 62, 118, 27, 18, 62, 127, 120, 11, 62, 1, 212, 4, 62, 29, 92, 252, 61, 114, 13, 239, 61, 41, 188, 225, 61, 102, 104, 212, 61, 78, 18, 199, 61, 8, 186, 185, 61, 184, 95, 172, 61, 132, 3, 159, 61, 146, 165, 145, 61, 7, 70, 132, 61, 18, 202, 109, 61, 122, 5, 83, 61, 145, 62, 56, 61, 164, 117, 29, 61, 252, 170, 2, 61, 202, 189, 207, 60, 86, 35, 154, 60, 97, 14, 73, 60, 197, 167, 187, 59, 61, 122, 86, 186, 9, 70, 241, 187, 18, 221, 99, 188, 80, 138, 167, 188, 65, 36, 221, 188, 227, 93, 9, 189, 35, 40, 36, 189, 150, 240, 62, 189, 242, 182, 89, 189, 234, 122, 116, 189, 26, 158, 135, 189, 66, 253, 148, 189, 200, 90, 162, 189, 134, 182, 175, 189, 87, 16, 189, 189, 22, 104, 202, 189, 155, 189, 215, 189, 195, 16, 229, 189, 105, 97, 242, 189, 101, 175, 255, 189, 74, 125, 6, 190, 104, 33, 13, 190, 250, 195, 19, 190, 237, 100, 26, 190, 46, 4, 33, 190, 172, 161, 39, 190, 83, 61, 46, 190, 16, 215, 52, 190, 210, 110, 59, 190, 134, 4, 66, 190, 25, 152, 72, 190, 121, 41, 79, 190, 148, 184, 85, 190, 86, 69, 92, 190, 174, 207, 98, 190, 137, 87, 105, 190, 214, 220, 111, 190, 128, 95, 118, 190, 120, 223, 124, 190, 84, 174, 129, 190, 129, 235, 132, 190, 56, 39, 136, 190, 114, 97, 139, 190, 36, 154, 142, 190, 69, 209, 145, 190, 205, 6, 149, 190, 179, 58, 152, 190, 238, 108, 155, 190, 116, 157, 158, 190, 61, 204, 161, 190, 64, 249, 164, 190, 115, 36, 168, 190, 207, 77, 171, 190, 73, 117, 174, 190, 218, 154, 177, 190, 120, 190, 180, 190, 27, 224, 183, 190, 186, 255, 186, 190, 75, 29, 190, 190, 199, 56, 193, 190, 37, 82, 196, 190, 91, 105, 199, 190, 97, 126, 202, 190, 48, 145, 205, 190, 188, 161, 208, 190, 0, 176, 211, 190, 241, 187, 214, 190, 135, 197, 217, 190, 186, 204, 220, 190, 129, 209, 223, 190, 211, 211, 226, 190, 169, 211, 229, 190, 250, 208, 232, 190, 189, 203, 235, 190, 234, 195, 238, 190, 120, 185, 241, 190, 96, 172, 244, 190, 154, 156, 247, 190, 28, 138, 250, 190, 223, 116, 253, 190, 109, 46, 0, 191, 3, 161, 1, 191, 45, 18, 3, 191, 230, 129, 4, 191, 44, 240, 5, 191, 250, 92, 7, 191, 76, 200, 8, 191, 30, 50, 10, 191, 108, 154, 11, 191, 50, 1, 13, 191, 108, 102, 14, 191, 23, 202, 15, 191, 45, 44, 17, 191, 172, 140, 18, 191, 144, 235, 19, 191, 213, 72, 21, 191, 118, 164, 22, 191, 113, 254, 23, 191, 192, 86, 25, 191, 98, 173, 26, 191, 81, 2, 28, 191, 138, 85, 29, 191, 9, 167, 30, 191, 203, 246, 31, 191, 204, 68, 33, 191, 9, 145, 34, 191, 124, 219, 35, 191, 36, 36, 37, 191, 253, 106, 38, 191, 2, 176, 39, 191, 48, 243, 40, 191, 132, 52, 42, 191, 250, 115, 43, 191, 143, 177, 44, 191, 63, 237, 45, 191, 7, 39, 47, 191, 227, 94, 48, 191, 208, 148, 49, 191, 202, 200, 50, 191, 206, 250, 51, 191, 218, 42, 53, 191, 232, 88, 54, 191, 247, 132, 55, 191, 2, 175, 56, 191, 7, 215, 57, 191, 3, 253, 58, 191, 241, 32, 60, 191, 207, 66, 61, 191, 154, 98, 62, 191, 79, 128, 63, 191, 233, 155, 64, 191, 104, 181, 65, 191, 198, 204, 66, 191, 1, 226, 67, 191, 23, 245, 68, 191, 3, 6, 70, 191, 196, 20, 71, 191, 86, 33, 72, 191, 182, 43, 73, 191, 225, 51, 74, 191, 212, 57, 75, 191, 141, 61, 76, 191, 9, 63, 77, 191, 68, 62, 78, 191, 61, 59, 79, 191, 240, 53, 80, 191, 90, 46, 81, 191, 121, 36, 82, 191, 74, 24, 83, 191, 202, 9, 84, 191, 247, 248, 84, 191, 206, 229, 85, 191, 77, 208, 86, 191, 112, 184, 87, 191, 55, 158, 88, 191, 156, 129, 89, 191, 160, 98, 90, 191, 62, 65, 91, 191, 117, 29, 92, 191, 65, 247, 92, 191, 162, 206, 93, 191, 148, 163, 94, 191, 20, 118, 95, 191, 34, 70, 96, 191, 186, 19, 97, 191, 217, 222, 97, 191, 127, 167, 98, 191, 169, 109, 99, 191, 84, 49, 100, 191, 126, 242, 100, 191, 38, 177, 101, 191, 73, 109, 102, 191, 229, 38, 103, 191, 248, 221, 103, 191, 128, 146, 104, 191, 123, 68, 105, 191, 232, 243, 105, 191, 195, 160, 106, 191, 12, 75, 107, 191, 192, 242, 107, 191, 222, 151, 108, 191, 100, 58, 109, 191, 80, 218, 109, 191, 160, 119, 110, 191, 83, 18, 111, 191, 102, 170, 111, 191, 217, 63, 112, 191, 169, 210, 112, 191, 213, 98, 113, 191, 91, 240, 113, 191, 58, 123, 114, 191, 113, 3, 115, 191, 253, 136, 115, 191, 222, 11, 116, 191, 17, 140, 116, 191, 150, 9, 117, 191, 107, 132, 117, 191, 143, 252, 117, 191, 0, 114, 118, 191, 189, 228, 118, 191, 198, 84, 119, 191, 24, 194, 119, 191, 178, 44, 120, 191, 147, 148, 120, 191, 187, 249, 120, 191, 40, 92, 121, 191, 217, 187, 121, 191, 205, 24, 122, 191, 2, 115, 122, 191, 121, 202, 122, 191, 47, 31, 123, 191, 36, 113, 123, 191, 88, 192, 123, 191, 201, 12, 124, 191, 118, 86, 124, 191, 95, 157, 124, 191, 130, 225, 124, 191, 224, 34, 125, 191, 119, 97, 125, 191, 71, 157, 125, 191, 79, 214, 125, 191, 142, 12, 126, 191, 4, 64, 126, 191, 176, 112, 126, 191, 146, 158, 126, 191, 169, 201, 126, 191, 245, 241, 126, 191, 117, 23, 127, 191, 41, 58, 127, 191, 16, 90, 127, 191, 43, 119, 127, 191, 120, 145, 127, 191, 248, 168, 127, 191, 170, 189, 127, 191, 143, 207, 127, 191, 165, 222, 127, 191, 237, 234, 127, 191, 102, 244, 127, 191, 17, 251, 127, 191, 237, 254, 127, 191, 234, 255, 127, 63, 229, 248, 127, 63, 166, 230, 127, 63, 45, 201, 127, 63, 124, 160, 127, 63, 149, 108, 127, 63, 121, 45, 127, 63, 44, 227, 126, 63, 177, 141, 126, 63, 11, 45, 126, 63, 63, 193, 125, 63, 82, 74, 125, 63, 72, 200, 124, 63, 40, 59, 124, 63, 247, 162, 123, 63, 189, 255, 122, 63, 128, 81, 122, 63, 72, 152, 121, 63, 30, 212, 120, 63, 9, 5, 120, 63, 19, 43, 119, 63, 70, 70, 118, 63, 172, 86, 117, 63, 78, 92, 116, 63, 56, 87, 115, 63, 118, 71, 114, 63, 19, 45, 113, 63, 28, 8, 112, 63, 158, 216, 110, 63, 165, 158, 109, 63, 64, 90, 108, 63, 126, 11, 107, 63, 107, 178, 105, 63, 25, 79, 104, 63, 150, 225, 102, 63, 242, 105, 101, 63, 62, 232, 99, 63, 139, 92, 98, 63, 234, 198, 96, 63, 109, 39, 95, 63, 38, 126, 93, 63, 40, 203, 91, 63, 133, 14, 90, 63, 83, 72, 88, 63, 163, 120, 86, 63, 139, 159, 84, 63, 32, 189, 82, 63, 118, 209, 80, 63, 163, 220, 78, 63, 189, 222, 76, 63, 219, 215, 74, 63, 19, 200, 72, 63, 124, 175, 70, 63, 46, 142, 68, 63, 65, 100, 66, 63, 206, 49, 64, 63, 236, 246, 61, 63, 180, 179, 59, 63, 66, 104, 57, 63, 173, 20, 55, 63, 16, 185, 52, 63, 134, 85, 50, 63, 41, 234, 47, 63, 21, 119, 45, 63, 101, 252, 42, 63, 53, 122, 40, 63, 161, 240, 37, 63, 198, 95, 35, 63, 192, 199, 32, 63, 172, 40, 30, 63, 169, 130, 27, 63, 212, 213, 24, 63, 74, 34, 22, 63, 42, 104, 19, 63, 147, 167, 16, 63, 164, 224, 13, 63, 123, 19, 11, 63, 57, 64, 8, 63, 253, 102, 5, 63, 231, 135, 2, 63, 45, 70, 255, 62, 91, 113, 249, 62, 151, 145, 243, 62, 36, 167, 237, 62, 69, 178, 231, 62, 60, 179, 225, 62, 76, 170, 219, 62, 186, 151, 213, 62, 201, 123, 207, 62, 190, 86, 201, 62, 223, 40, 195, 62, 112, 242, 188, 62, 183, 179, 182, 62, 251, 108, 176, 62, 129, 30, 170, 62, 146, 200, 163, 62, 115, 107, 157, 62, 108, 7, 151, 62, 197, 156, 144, 62, 199, 43, 138, 62, 185, 180, 131, 62, 199, 111, 122, 62, 33, 107, 109, 62, 17, 92, 96, 62, 41, 67, 83, 62, 253, 32, 70, 62, 32, 246, 56, 62, 38, 195, 43, 62, 164, 136, 30, 62, 45, 71, 17, 62, 87, 255, 3, 62, 110, 99, 237, 61, 194, 189, 210, 61, 218, 14, 184, 61, 222, 87, 157, 61, 251, 153, 130, 61, 188, 172, 79, 61, 101, 28, 26, 61, 153, 10, 201, 60, 42, 167, 59, 60, 193, 120, 214, 186, 45, 68, 113, 188, 87, 215, 227, 188, 76, 129, 39, 189, 148, 15, 93, 189, 21, 74, 137, 189, 90, 6, 164, 189, 109, 187, 190, 189, 34, 104, 217, 189, 78, 11, 244, 189, 227, 81, 7, 190, 47, 152, 20, 190, 247, 215, 33, 190, 165, 16, 47, 190, 166, 65, 60, 190, 100, 106, 73, 190, 77, 138, 86, 190, 205, 160, 99, 190, 80, 173, 112, 190, 69, 175, 125, 190, 13, 83, 133, 190, 158, 200, 139, 190, 13, 56, 146, 190, 18, 161, 152, 190, 102, 3, 159, 190, 191, 94, 165, 190, 216, 178, 171, 190, 105, 255, 177, 190, 43, 68, 184, 190, 216, 128, 190, 190, 42, 181, 196, 190, 219, 224, 202, 190, 165, 3, 209, 190, 69, 29, 215, 190, 117, 45, 221, 190, 241, 51, 227, 190, 118, 48, 233, 190, 192, 34, 239, 190, 141, 10, 245, 190, 155, 231, 250, 190, 211, 92, 0, 191, 56, 64, 3, 191, 219, 29, 6, 191, 155, 245, 8, 191, 90, 199, 11, 191, 247, 146, 14, 191, 84, 88, 17, 191, 80, 23, 20, 191, 205, 207, 22, 191, 172, 129, 25, 191, 208, 44, 28, 191, 26, 209, 30, 191, 109, 110, 33, 191, 171, 4, 36, 191, 183, 147, 38, 191, 116, 27, 41, 191, 199, 155, 43, 191, 147, 20, 46, 191, 187, 133, 48, 191, 38, 239, 50, 191, 183, 80, 53, 191, 85, 170, 55, 191, 227, 251, 57, 191, 74, 69, 60, 191, 110, 134, 62, 191, 55, 191, 64, 191, 139, 239, 66, 191, 83, 23, 69, 191, 117, 54, 71, 191, 218, 76, 73, 191, 107, 90, 75, 191, 16, 95, 77, 191, 179, 90, 79, 191, 62, 77, 81, 191, 154, 54, 83, 191, 179, 22, 85, 191, 114, 237, 86, 191, 197, 186, 88, 191, 149, 126, 90, 191, 208, 56, 92, 191, 98, 233, 93, 191, 56, 144, 95, 191, 64, 45, 97, 191, 103, 192, 98, 191, 156, 73, 100, 191, 206, 200, 101, 191, 235, 61, 103, 191, 227, 168, 104, 191, 167, 9, 106, 191, 39, 96, 107, 191, 84, 172, 108, 191, 31, 238, 109, 191, 122, 37, 111, 191, 88, 82, 112, 191, 171, 116, 113, 191, 103, 140, 114, 191, 127, 153, 115, 191, 231, 155, 116, 191, 149, 147, 117, 191, 126, 128, 118, 191, 150, 98, 119, 191, 212, 57, 120, 191, 47, 6, 121, 191, 158, 199, 121, 191, 23, 126, 122, 191, 148, 41, 123, 191, 13, 202, 123, 191, 122, 95, 124, 191, 213, 233, 124, 191, 24, 105, 125, 191, 62, 221, 125, 191, 64, 70, 126, 191, 28, 164, 126, 191, 204, 246, 126, 191, 77, 62, 127, 191, 156, 122, 127, 191, 182, 171, 127, 191, 153, 209, 127, 191, 67, 236, 127, 191, 180, 251, 127, 191, 166, 255, 127, 63, 148, 227, 127, 63, 156, 154, 127, 63, 204, 36, 127, 63, 56, 130, 126, 63, 253, 178, 125, 63, 63, 183, 124, 63, 42, 143, 123, 63, 243, 58, 122, 63, 212, 186, 120, 63, 17, 15, 119, 63, 246, 55, 117, 63, 213, 53, 115, 63, 8, 9, 113, 63, 241, 177, 110, 63, 249, 48, 108, 63, 144, 134, 105, 63, 47, 179, 102, 63, 83, 183, 99, 63, 132, 147, 96, 63, 78, 72, 93, 63, 69, 214, 89, 63, 3, 62, 86, 63, 43, 128, 82, 63, 101, 157, 78, 63, 94, 150, 74, 63, 204, 107, 70, 63, 106, 30, 66, 63, 249, 174, 61, 63, 64, 30, 57, 63, 13, 109, 52, 63, 50, 156, 47, 63, 135, 172, 42, 63, 235, 158, 37, 63, 63, 116, 32, 63, 109, 45, 27, 63, 97, 203, 21, 63, 13, 79, 16, 63, 104, 185, 10, 63, 107, 11, 5, 63, 46, 140, 254, 62, 221, 212, 242, 62, 241, 242, 230, 62, 127, 232, 218, 62, 166, 183, 206, 62, 136, 98, 194, 62, 78, 235, 181, 62, 42, 84, 169, 62, 81, 159, 156, 62, 253, 206, 143, 62, 109, 229, 130, 62, 206, 201, 107, 62, 98, 159, 81, 62, 48, 80, 55, 62, 211, 224, 28, 62, 241, 85, 2, 62, 98, 104, 207, 61, 124, 0, 154, 61, 36, 251, 72, 61, 27, 164, 187, 60, 243, 119, 86, 187, 100, 61, 241, 188, 187, 192, 99, 189, 103, 93, 167, 189, 20, 189, 220, 189, 3, 251, 8, 190, 115, 127, 35, 190, 52, 231, 61, 190, 164, 45, 88, 190, 38, 78, 114, 190, 18, 34, 134, 190, 137, 5, 147, 190, 52, 207, 159, 190, 213, 124, 172, 190, 51, 12, 185, 190, 26, 123, 197, 190, 91, 199, 209, 190, 205, 238, 221, 190, 80, 239, 233, 190, 199, 198, 245, 190, 144, 185, 0, 191, 38, 121, 6, 191, 36, 33, 12, 191, 141, 176, 17, 191, 102, 38, 23, 191, 186, 129, 28, 191, 152, 193, 33, 191, 21, 229, 38, 191, 74, 235, 43, 191, 86, 211, 48, 191, 91, 156, 53, 191, 131, 69, 58, 191, 253, 205, 62, 191, 252, 52, 67, 191, 188, 121, 71, 191, 125, 155, 75, 191, 132, 153, 79, 191, 31, 115, 83, 191, 161, 39, 87, 191, 99, 182, 90, 191, 198, 30, 94, 191, 48, 96, 97, 191, 15, 122, 100, 191, 216, 107, 103, 191, 7, 53, 106, 191, 31, 213, 108, 191, 169, 75, 111, 191, 55, 152, 113, 191, 98, 186, 115, 191, 201, 177, 117, 191, 22, 126, 119, 191, 246, 30, 121, 191, 33, 148, 122, 191, 85, 221, 123, 191, 89, 250, 124, 191, 250, 234, 125, 191, 14, 175, 126, 191, 116, 70, 127, 191, 15, 177, 127, 191, 206, 238, 127, 191, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 82, 0, 82, 0, 123, 0, 164, 0, 200, 0, 222, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 164, 0, 164, 0, 240, 0, 10, 1, 27, 1, 39, 1, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 10, 1, 10, 1, 49, 1, 62, 1, 72, 1, 80, 1, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 62, 1, 62, 1, 87, 1, 95, 1, 102, 1, 108, 1, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 49, 1, 87, 1, 87, 1, 87, 1, 95, 1, 95, 1, 114, 1, 120, 1, 126, 1, 131, 1, 0, 0, 0, 0, 0, 0, 40, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 40, 15, 23, 28, 31, 34, 36, 38, 39, 41, 42, 43, 44, 45, 46, 47, 47, 49, 50, 51, 52, 53, 54, 55, 55, 57, 58, 59, 60, 61, 62, 63, 63, 65, 66, 67, 68, 69, 70, 71, 71, 40, 20, 33, 41, 48, 53, 57, 61, 64, 66, 69, 71, 73, 75, 76, 78, 80, 82, 85, 87, 89, 91, 92, 94, 96, 98, 101, 103, 105, 107, 108, 110, 112, 114, 117, 119, 121, 123, 124, 126, 128, 40, 23, 39, 51, 60, 67, 73, 79, 83, 87, 91, 94, 97, 100, 102, 105, 107, 111, 115, 118, 121, 124, 126, 129, 131, 135, 139, 142, 145, 148, 150, 153, 155, 159, 163, 166, 169, 172, 174, 177, 179, 35, 28, 49, 65, 78, 89, 99, 107, 114, 120, 126, 132, 136, 141, 145, 149, 153, 159, 165, 171, 176, 180, 185, 189, 192, 199, 205, 211, 216, 220, 225, 229, 232, 239, 245, 251, 21, 33, 58, 79, 97, 112, 125, 137, 148, 157, 166, 174, 182, 189, 195, 201, 207, 217, 227, 235, 243, 251, 17, 35, 63, 86, 106, 123, 139, 152, 165, 177, 187, 197, 206, 214, 222, 230, 237, 250, 25, 31, 55, 75, 91, 105, 117, 128, 138, 146, 154, 161, 168, 174, 180, 185, 190, 200, 208, 215, 222, 229, 235, 240, 245, 255, 16, 36, 65, 89, 110, 128, 144, 159, 173, 185, 196, 207, 217, 226, 234, 242, 250, 11, 41, 74, 103, 128, 151, 172, 191, 209, 225, 241, 255, 9, 43, 79, 110, 138, 163, 186, 207, 227, 246, 12, 39, 71, 99, 123, 144, 164, 182, 198, 214, 228, 241, 253, 9, 44, 81, 113, 142, 168, 192, 214, 235, 255, 7, 49, 90, 127, 160, 191, 220, 247, 6, 51, 95, 134, 170, 203, 234, 7, 47, 87, 123, 155, 184, 212, 237, 6, 52, 97, 137, 174, 208, 240, 5, 57, 106, 151, 192, 231, 5, 59, 111, 158, 202, 243, 5, 55, 103, 147, 187, 224, 5, 60, 113, 161, 206, 248, 4, 65, 122, 175, 224, 4, 67, 127, 182, 234, 224, 224, 224, 224, 224, 224, 224, 224, 160, 160, 160, 160, 185, 185, 185, 178, 178, 168, 134, 61, 37, 224, 224, 224, 224, 224, 224, 224, 224, 240, 240, 240, 240, 207, 207, 207, 198, 198, 183, 144, 66, 40, 160, 160, 160, 160, 160, 160, 160, 160, 185, 185, 185, 185, 193, 193, 193, 183, 183, 172, 138, 64, 38, 240, 240, 240, 240, 240, 240, 240, 240, 207, 207, 207, 207, 204, 204, 204, 193, 193, 180, 143, 66, 40, 185, 185, 185, 185, 185, 185, 185, 185, 193, 193, 193, 193, 193, 193, 193, 183, 183, 172, 138, 65, 39, 207, 207, 207, 207, 207, 207, 207, 207, 204, 204, 204, 204, 201, 201, 201, 188, 188, 176, 141, 66, 40, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 194, 194, 194, 184, 184, 173, 139, 65, 39, 204, 204, 204, 204, 204, 204, 204, 204, 201, 201, 201, 201, 198, 198, 198, 187, 187, 175, 140, 66, 40, 0, 0, 12, 0, 24, 0, 36, 0, 48, 0, 4, 0, 16, 0, 28, 0, 40, 0, 52, 0, 8, 0, 20, 0, 32, 0, 44, 0, 56, 0, 1, 0, 13, 0, 25, 0, 37, 0, 49, 0, 5, 0, 17, 0, 29, 0, 41, 0, 53, 0, 9, 0, 21, 0, 33, 0, 45, 0, 57, 0, 2, 0, 14, 0, 26, 0, 38, 0, 50, 0, 6, 0, 18, 0, 30, 0, 42, 0, 54, 0, 10, 0, 22, 0, 34, 0, 46, 0, 58, 0, 3, 0, 15, 0, 27, 0, 39, 0, 51, 0, 7, 0, 19, 0, 31, 0, 43, 0, 55, 0, 11, 0, 23, 0, 35, 0, 47, 0, 59, 0, 0, 0, 128, 63, 0, 0, 0, 128, 99, 250, 127, 63, 191, 117, 86, 188, 139, 233, 127, 63, 10, 113, 214, 188, 121, 205, 127, 63, 231, 206, 32, 189, 47, 166, 127, 63, 58, 94, 86, 189, 175, 115, 127, 63, 19, 242, 133, 189, 249, 53, 127, 63, 42, 175, 160, 189, 18, 237, 126, 63, 51, 101, 187, 189, 253, 152, 126, 63, 4, 19, 214, 189, 188, 57, 126, 63, 115, 183, 240, 189, 85, 207, 125, 63, 168, 168, 5, 190, 203, 89, 125, 63, 187, 239, 18, 190, 37, 217, 124, 63, 92, 48, 32, 190, 103, 77, 124, 63, 245, 105, 45, 190, 152, 182, 123, 63, 243, 155, 58, 190, 190, 20, 123, 63, 194, 197, 71, 190, 226, 103, 122, 63, 205, 230, 84, 190, 9, 176, 121, 63, 130, 254, 97, 190, 60, 237, 120, 63, 77, 12, 111, 190, 132, 31, 120, 63, 156, 15, 124, 190, 234, 70, 119, 63, 238, 131, 132, 190, 119, 99, 118, 63, 62, 250, 138, 190, 54, 117, 117, 63, 117, 106, 145, 190, 48, 124, 116, 63, 76, 212, 151, 190, 113, 120, 115, 63, 122, 55, 158, 190, 3, 106, 114, 63, 183, 147, 164, 190, 244, 80, 113, 63, 188, 232, 170, 190, 79, 45, 112, 63, 65, 54, 177, 190, 33, 255, 110, 63, 1, 124, 183, 190, 118, 198, 109, 63, 180, 185, 189, 190, 94, 131, 108, 63, 21, 239, 195, 190, 231, 53, 107, 63, 222, 27, 202, 190, 30, 222, 105, 63, 201, 63, 208, 190, 18, 124, 104, 63, 146, 90, 214, 190, 212, 15, 103, 63, 243, 107, 220, 190, 116, 153, 101, 63, 170, 115, 226, 190, 1, 25, 100, 63, 113, 113, 232, 190, 141, 142, 98, 63, 7, 101, 238, 190, 40, 250, 96, 63, 39, 78, 244, 190, 230, 91, 95, 63, 144, 44, 250, 190, 215, 179, 93, 63, 0, 0, 0, 191, 15, 2, 92, 63, 27, 228, 2, 191, 160, 70, 90, 63, 119, 194, 5, 191, 158, 129, 88, 63, 246, 154, 8, 191, 29, 179, 86, 63, 119, 109, 11, 191, 49, 219, 84, 63, 218, 57, 14, 191, 239, 249, 82, 63, 0, 0, 17, 191, 108, 15, 81, 63, 202, 191, 19, 191, 189, 27, 79, 63, 24, 121, 22, 191, 248, 30, 77, 63, 205, 43, 25, 191, 52, 25, 75, 63, 202, 215, 27, 191, 136, 10, 73, 63, 241, 124, 30, 191, 10, 243, 70, 63, 36, 27, 33, 191, 209, 210, 68, 63, 70, 178, 35, 191, 247, 169, 66, 63, 58, 66, 38, 191, 147, 120, 64, 63, 227, 202, 40, 191, 189, 62, 62, 63, 37, 76, 43, 191, 143, 252, 59, 63, 227, 197, 45, 191, 34, 178, 57, 63, 1, 56, 48, 191, 144, 95, 55, 63, 101, 162, 50, 191, 243, 4, 53, 63, 243, 4, 53, 191, 101, 162, 50, 63, 144, 95, 55, 191, 1, 56, 48, 63, 34, 178, 57, 191, 227, 197, 45, 63, 143, 252, 59, 191, 37, 76, 43, 63, 189, 62, 62, 191, 227, 202, 40, 63, 147, 120, 64, 191, 58, 66, 38, 63, 247, 169, 66, 191, 70, 178, 35, 63, 209, 210, 68, 191, 36, 27, 33, 63, 10, 243, 70, 191, 241, 124, 30, 63, 136, 10, 73, 191, 202, 215, 27, 63, 52, 25, 75, 191, 205, 43, 25, 63, 248, 30, 77, 191, 24, 121, 22, 63, 189, 27, 79, 191, 202, 191, 19, 63, 108, 15, 81, 191, 0, 0, 17, 63, 239, 249, 82, 191, 218, 57, 14, 63, 49, 219, 84, 191, 119, 109, 11, 63, 29, 179, 86, 191, 246, 154, 8, 63, 158, 129, 88, 191, 119, 194, 5, 63, 160, 70, 90, 191, 27, 228, 2, 63, 15, 2, 92, 191, 0, 0, 0, 63, 215, 179, 93, 191, 144, 44, 250, 62, 230, 91, 95, 191, 39, 78, 244, 62, 40, 250, 96, 191, 7, 101, 238, 62, 141, 142, 98, 191, 113, 113, 232, 62, 1, 25, 100, 191, 170, 115, 226, 62, 116, 153, 101, 191, 243, 107, 220, 62, 212, 15, 103, 191, 146, 90, 214, 62, 18, 124, 104, 191, 201, 63, 208, 62, 30, 222, 105, 191, 222, 27, 202, 62, 231, 53, 107, 191, 21, 239, 195, 62, 94, 131, 108, 191, 180, 185, 189, 62, 118, 198, 109, 191, 1, 124, 183, 62, 33, 255, 110, 191, 65, 54, 177, 62, 79, 45, 112, 191, 188, 232, 170, 62, 244, 80, 113, 191, 183, 147, 164, 62, 3, 106, 114, 191, 122, 55, 158, 62, 113, 120, 115, 191, 76, 212, 151, 62, 48, 124, 116, 191, 117, 106, 145, 62, 54, 117, 117, 191, 62, 250, 138, 62, 119, 99, 118, 191, 238, 131, 132, 62, 234, 70, 119, 191, 156, 15, 124, 62, 132, 31, 120, 191, 77, 12, 111, 62, 60, 237, 120, 191, 130, 254, 97, 62, 9, 176, 121, 191, 205, 230, 84, 62, 226, 103, 122, 191, 194, 197, 71, 62, 190, 20, 123, 191, 243, 155, 58, 62, 152, 182, 123, 191, 245, 105, 45, 62, 103, 77, 124, 191, 92, 48, 32, 62, 37, 217, 124, 191, 187, 239, 18, 62, 203, 89, 125, 191, 168, 168, 5, 62, 85, 207, 125, 191, 115, 183, 240, 61, 188, 57, 126, 191, 4, 19, 214, 61, 253, 152, 126, 191, 51, 101, 187, 61, 18, 237, 126, 191, 42, 175, 160, 61, 249, 53, 127, 191, 19, 242, 133, 61, 175, 115, 127, 191, 58, 94, 86, 61, 47, 166, 127, 191, 231, 206, 32, 61, 121, 205, 127, 191, 10, 113, 214, 60, 139, 233, 127, 191, 191, 117, 86, 60, 99, 250, 127, 191, 0, 48, 141, 36, 0, 0, 128, 191, 191, 117, 86, 188, 99, 250, 127, 191, 10, 113, 214, 188, 139, 233, 127, 191, 231, 206, 32, 189, 121, 205, 127, 191, 58, 94, 86, 189, 47, 166, 127, 191, 19, 242, 133, 189, 175, 115, 127, 191, 42, 175, 160, 189, 249, 53, 127, 191, 51, 101, 187, 189, 18, 237, 126, 191, 4, 19, 214, 189, 253, 152, 126, 191, 115, 183, 240, 189, 188, 57, 126, 191, 168, 168, 5, 190, 85, 207, 125, 191, 187, 239, 18, 190, 203, 89, 125, 191, 92, 48, 32, 190, 37, 217, 124, 191, 245, 105, 45, 190, 103, 77, 124, 191, 243, 155, 58, 190, 152, 182, 123, 191, 194, 197, 71, 190, 190, 20, 123, 191, 205, 230, 84, 190, 226, 103, 122, 191, 130, 254, 97, 190, 9, 176, 121, 191, 77, 12, 111, 190, 60, 237, 120, 191, 156, 15, 124, 190, 132, 31, 120, 191, 238, 131, 132, 190, 234, 70, 119, 191, 62, 250, 138, 190, 119, 99, 118, 191, 117, 106, 145, 190, 54, 117, 117, 191, 76, 212, 151, 190, 48, 124, 116, 191, 122, 55, 158, 190, 113, 120, 115, 191, 183, 147, 164, 190, 3, 106, 114, 191, 188, 232, 170, 190, 244, 80, 113, 191, 65, 54, 177, 190, 79, 45, 112, 191, 1, 124, 183, 190, 33, 255, 110, 191, 180, 185, 189, 190, 118, 198, 109, 191, 21, 239, 195, 190, 94, 131, 108, 191, 222, 27, 202, 190, 231, 53, 107, 191, 201, 63, 208, 190, 30, 222, 105, 191, 146, 90, 214, 190, 18, 124, 104, 191, 243, 107, 220, 190, 212, 15, 103, 191, 170, 115, 226, 190, 116, 153, 101, 191, 113, 113, 232, 190, 1, 25, 100, 191, 7, 101, 238, 190, 141, 142, 98, 191, 39, 78, 244, 190, 40, 250, 96, 191, 144, 44, 250, 190, 230, 91, 95, 191, 0, 0, 0, 191, 215, 179, 93, 191, 27, 228, 2, 191, 15, 2, 92, 191, 119, 194, 5, 191, 160, 70, 90, 191, 246, 154, 8, 191, 158, 129, 88, 191, 119, 109, 11, 191, 29, 179, 86, 191, 218, 57, 14, 191, 49, 219, 84, 191, 0, 0, 17, 191, 239, 249, 82, 191, 202, 191, 19, 191, 108, 15, 81, 191, 24, 121, 22, 191, 189, 27, 79, 191, 205, 43, 25, 191, 248, 30, 77, 191, 202, 215, 27, 191, 52, 25, 75, 191, 241, 124, 30, 191, 136, 10, 73, 191, 36, 27, 33, 191, 10, 243, 70, 191, 70, 178, 35, 191, 209, 210, 68, 191, 58, 66, 38, 191, 247, 169, 66, 191, 227, 202, 40, 191, 147, 120, 64, 191, 37, 76, 43, 191, 189, 62, 62, 191, 227, 197, 45, 191, 143, 252, 59, 191, 1, 56, 48, 191, 34, 178, 57, 191, 101, 162, 50, 191, 144, 95, 55, 191, 243, 4, 53, 191, 243, 4, 53, 191, 144, 95, 55, 191, 101, 162, 50, 191, 34, 178, 57, 191, 1, 56, 48, 191, 143, 252, 59, 191, 227, 197, 45, 191, 189, 62, 62, 191, 37, 76, 43, 191, 147, 120, 64, 191, 227, 202, 40, 191, 247, 169, 66, 191, 58, 66, 38, 191, 209, 210, 68, 191, 70, 178, 35, 191, 10, 243, 70, 191, 36, 27, 33, 191, 136, 10, 73, 191, 241, 124, 30, 191, 52, 25, 75, 191, 202, 215, 27, 191, 248, 30, 77, 191, 205, 43, 25, 191, 189, 27, 79, 191, 24, 121, 22, 191, 108, 15, 81, 191, 202, 191, 19, 191, 239, 249, 82, 191, 0, 0, 17, 191, 49, 219, 84, 191, 218, 57, 14, 191, 29, 179, 86, 191, 119, 109, 11, 191, 158, 129, 88, 191, 246, 154, 8, 191, 160, 70, 90, 191, 119, 194, 5, 191, 15, 2, 92, 191, 27, 228, 2, 191, 215, 179, 93, 191, 0, 0, 0, 191, 230, 91, 95, 191, 144, 44, 250, 190, 40, 250, 96, 191, 39, 78, 244, 190, 141, 142, 98, 191, 7, 101, 238, 190, 1, 25, 100, 191, 113, 113, 232, 190, 116, 153, 101, 191, 170, 115, 226, 190, 212, 15, 103, 191, 243, 107, 220, 190, 18, 124, 104, 191, 146, 90, 214, 190, 30, 222, 105, 191, 201, 63, 208, 190, 231, 53, 107, 191, 222, 27, 202, 190, 94, 131, 108, 191, 21, 239, 195, 190, 118, 198, 109, 191, 180, 185, 189, 190, 33, 255, 110, 191, 1, 124, 183, 190, 79, 45, 112, 191, 65, 54, 177, 190, 244, 80, 113, 191, 188, 232, 170, 190, 3, 106, 114, 191, 183, 147, 164, 190, 113, 120, 115, 191, 122, 55, 158, 190, 48, 124, 116, 191, 76, 212, 151, 190, 54, 117, 117, 191, 117, 106, 145, 190, 119, 99, 118, 191, 62, 250, 138, 190, 234, 70, 119, 191, 238, 131, 132, 190, 132, 31, 120, 191, 156, 15, 124, 190, 60, 237, 120, 191, 77, 12, 111, 190, 9, 176, 121, 191, 130, 254, 97, 190, 226, 103, 122, 191, 205, 230, 84, 190, 190, 20, 123, 191, 194, 197, 71, 190, 152, 182, 123, 191, 243, 155, 58, 190, 103, 77, 124, 191, 245, 105, 45, 190, 37, 217, 124, 191, 92, 48, 32, 190, 203, 89, 125, 191, 187, 239, 18, 190, 85, 207, 125, 191, 168, 168, 5, 190, 188, 57, 126, 191, 115, 183, 240, 189, 253, 152, 126, 191, 4, 19, 214, 189, 18, 237, 126, 191, 51, 101, 187, 189, 249, 53, 127, 191, 42, 175, 160, 189, 175, 115, 127, 191, 19, 242, 133, 189, 47, 166, 127, 191, 58, 94, 86, 189, 121, 205, 127, 191, 231, 206, 32, 189, 139, 233, 127, 191, 10, 113, 214, 188, 99, 250, 127, 191, 191, 117, 86, 188, 0, 0, 128, 191, 0, 48, 13, 165, 99, 250, 127, 191, 191, 117, 86, 60, 139, 233, 127, 191, 10, 113, 214, 60, 121, 205, 127, 191, 231, 206, 32, 61, 47, 166, 127, 191, 58, 94, 86, 61, 175, 115, 127, 191, 19, 242, 133, 61, 249, 53, 127, 191, 42, 175, 160, 61, 18, 237, 126, 191, 51, 101, 187, 61, 253, 152, 126, 191, 4, 19, 214, 61, 188, 57, 126, 191, 115, 183, 240, 61, 85, 207, 125, 191, 168, 168, 5, 62, 203, 89, 125, 191, 187, 239, 18, 62, 37, 217, 124, 191, 92, 48, 32, 62, 103, 77, 124, 191, 245, 105, 45, 62, 152, 182, 123, 191, 243, 155, 58, 62, 190, 20, 123, 191, 194, 197, 71, 62, 226, 103, 122, 191, 205, 230, 84, 62, 9, 176, 121, 191, 130, 254, 97, 62, 60, 237, 120, 191, 77, 12, 111, 62, 132, 31, 120, 191, 156, 15, 124, 62, 234, 70, 119, 191, 238, 131, 132, 62, 119, 99, 118, 191, 62, 250, 138, 62, 54, 117, 117, 191, 117, 106, 145, 62, 48, 124, 116, 191, 76, 212, 151, 62, 113, 120, 115, 191, 122, 55, 158, 62, 3, 106, 114, 191, 183, 147, 164, 62, 244, 80, 113, 191, 188, 232, 170, 62, 79, 45, 112, 191, 65, 54, 177, 62, 33, 255, 110, 191, 1, 124, 183, 62, 118, 198, 109, 191, 180, 185, 189, 62, 94, 131, 108, 191, 21, 239, 195, 62, 231, 53, 107, 191, 222, 27, 202, 62, 30, 222, 105, 191, 201, 63, 208, 62, 18, 124, 104, 191, 146, 90, 214, 62, 212, 15, 103, 191, 243, 107, 220, 62, 116, 153, 101, 191, 170, 115, 226, 62, 1, 25, 100, 191, 113, 113, 232, 62, 141, 142, 98, 191, 7, 101, 238, 62, 40, 250, 96, 191, 39, 78, 244, 62, 230, 91, 95, 191, 144, 44, 250, 62, 215, 179, 93, 191, 0, 0, 0, 63, 15, 2, 92, 191, 27, 228, 2, 63, 160, 70, 90, 191, 119, 194, 5, 63, 158, 129, 88, 191, 246, 154, 8, 63, 29, 179, 86, 191, 119, 109, 11, 63, 49, 219, 84, 191, 218, 57, 14, 63, 239, 249, 82, 191, 0, 0, 17, 63, 108, 15, 81, 191, 202, 191, 19, 63, 189, 27, 79, 191, 24, 121, 22, 63, 248, 30, 77, 191, 205, 43, 25, 63, 52, 25, 75, 191, 202, 215, 27, 63, 136, 10, 73, 191, 241, 124, 30, 63, 10, 243, 70, 191, 36, 27, 33, 63, 209, 210, 68, 191, 70, 178, 35, 63, 247, 169, 66, 191, 58, 66, 38, 63, 147, 120, 64, 191, 227, 202, 40, 63, 189, 62, 62, 191, 37, 76, 43, 63, 143, 252, 59, 191, 227, 197, 45, 63, 34, 178, 57, 191, 1, 56, 48, 63, 144, 95, 55, 191, 101, 162, 50, 63, 243, 4, 53, 191, 243, 4, 53, 63, 101, 162, 50, 191, 144, 95, 55, 63, 1, 56, 48, 191, 34, 178, 57, 63, 227, 197, 45, 191, 143, 252, 59, 63, 37, 76, 43, 191, 189, 62, 62, 63, 227, 202, 40, 191, 147, 120, 64, 63, 58, 66, 38, 191, 247, 169, 66, 63, 70, 178, 35, 191, 209, 210, 68, 63, 36, 27, 33, 191, 10, 243, 70, 63, 241, 124, 30, 191, 136, 10, 73, 63, 202, 215, 27, 191, 52, 25, 75, 63, 205, 43, 25, 191, 248, 30, 77, 63, 24, 121, 22, 191, 189, 27, 79, 63, 202, 191, 19, 191, 108, 15, 81, 63, 0, 0, 17, 191, 239, 249, 82, 63, 218, 57, 14, 191, 49, 219, 84, 63, 119, 109, 11, 191, 29, 179, 86, 63, 246, 154, 8, 191, 158, 129, 88, 63, 119, 194, 5, 191, 160, 70, 90, 63, 27, 228, 2, 191, 15, 2, 92, 63, 0, 0, 0, 191, 215, 179, 93, 63, 144, 44, 250, 190, 230, 91, 95, 63, 39, 78, 244, 190, 40, 250, 96, 63, 7, 101, 238, 190, 141, 142, 98, 63, 113, 113, 232, 190, 1, 25, 100, 63, 170, 115, 226, 190, 116, 153, 101, 63, 243, 107, 220, 190, 212, 15, 103, 63, 146, 90, 214, 190, 18, 124, 104, 63, 201, 63, 208, 190, 30, 222, 105, 63, 222, 27, 202, 190, 231, 53, 107, 63, 21, 239, 195, 190, 94, 131, 108, 63, 180, 185, 189, 190, 118, 198, 109, 63, 1, 124, 183, 190, 33, 255, 110, 63, 65, 54, 177, 190, 79, 45, 112, 63, 188, 232, 170, 190, 244, 80, 113, 63, 183, 147, 164, 190, 3, 106, 114, 63, 122, 55, 158, 190, 113, 120, 115, 63, 76, 212, 151, 190, 48, 124, 116, 63, 117, 106, 145, 190, 54, 117, 117, 63, 62, 250, 138, 190, 119, 99, 118, 63, 238, 131, 132, 190, 234, 70, 119, 63, 156, 15, 124, 190, 132, 31, 120, 63, 77, 12, 111, 190, 60, 237, 120, 63, 130, 254, 97, 190, 9, 176, 121, 63, 205, 230, 84, 190, 226, 103, 122, 63, 194, 197, 71, 190, 190, 20, 123, 63, 243, 155, 58, 190, 152, 182, 123, 63, 245, 105, 45, 190, 103, 77, 124, 63, 92, 48, 32, 190, 37, 217, 124, 63, 187, 239, 18, 190, 203, 89, 125, 63, 168, 168, 5, 190, 85, 207, 125, 63, 115, 183, 240, 189, 188, 57, 126, 63, 4, 19, 214, 189, 253, 152, 126, 63, 51, 101, 187, 189, 18, 237, 126, 63, 42, 175, 160, 189, 249, 53, 127, 63, 19, 242, 133, 189, 175, 115, 127, 63, 58, 94, 86, 189, 47, 166, 127, 63, 231, 206, 32, 189, 121, 205, 127, 63, 10, 113, 214, 188, 139, 233, 127, 63, 191, 117, 86, 188, 99, 250, 127, 63, 0, 200, 83, 165, 0, 0, 128, 63, 191, 117, 86, 60, 99, 250, 127, 63, 10, 113, 214, 60, 139, 233, 127, 63, 231, 206, 32, 61, 121, 205, 127, 63, 58, 94, 86, 61, 47, 166, 127, 63, 19, 242, 133, 61, 175, 115, 127, 63, 42, 175, 160, 61, 249, 53, 127, 63, 51, 101, 187, 61, 18, 237, 126, 63, 4, 19, 214, 61, 253, 152, 126, 63, 115, 183, 240, 61, 188, 57, 126, 63, 168, 168, 5, 62, 85, 207, 125, 63, 187, 239, 18, 62, 203, 89, 125, 63, 92, 48, 32, 62, 37, 217, 124, 63, 245, 105, 45, 62, 103, 77, 124, 63, 243, 155, 58, 62, 152, 182, 123, 63, 194, 197, 71, 62, 190, 20, 123, 63, 205, 230, 84, 62, 226, 103, 122, 63, 130, 254, 97, 62, 9, 176, 121, 63, 77, 12, 111, 62, 60, 237, 120, 63, 156, 15, 124, 62, 132, 31, 120, 63, 238, 131, 132, 62, 234, 70, 119, 63, 62, 250, 138, 62, 119, 99, 118, 63, 117, 106, 145, 62, 54, 117, 117, 63, 76, 212, 151, 62, 48, 124, 116, 63, 122, 55, 158, 62, 113, 120, 115, 63, 183, 147, 164, 62, 3, 106, 114, 63, 188, 232, 170, 62, 244, 80, 113, 63, 65, 54, 177, 62, 79, 45, 112, 63, 1, 124, 183, 62, 33, 255, 110, 63, 180, 185, 189, 62, 118, 198, 109, 63, 21, 239, 195, 62, 94, 131, 108, 63, 222, 27, 202, 62, 231, 53, 107, 63, 201, 63, 208, 62, 30, 222, 105, 63, 146, 90, 214, 62, 18, 124, 104, 63, 243, 107, 220, 62, 212, 15, 103, 63, 170, 115, 226, 62, 116, 153, 101, 63, 113, 113, 232, 62, 1, 25, 100, 63, 7, 101, 238, 62, 141, 142, 98, 63, 39, 78, 244, 62, 40, 250, 96, 63, 144, 44, 250, 62, 230, 91, 95, 63, 0, 0, 0, 63, 215, 179, 93, 63, 27, 228, 2, 63, 15, 2, 92, 63, 119, 194, 5, 63, 160, 70, 90, 63, 246, 154, 8, 63, 158, 129, 88, 63, 119, 109, 11, 63, 29, 179, 86, 63, 218, 57, 14, 63, 49, 219, 84, 63, 0, 0, 17, 63, 239, 249, 82, 63, 202, 191, 19, 63, 108, 15, 81, 63, 24, 121, 22, 63, 189, 27, 79, 63, 205, 43, 25, 63, 248, 30, 77, 63, 202, 215, 27, 63, 52, 25, 75, 63, 241, 124, 30, 63, 136, 10, 73, 63, 36, 27, 33, 63, 10, 243, 70, 63, 70, 178, 35, 63, 209, 210, 68, 63, 58, 66, 38, 63, 247, 169, 66, 63, 227, 202, 40, 63, 147, 120, 64, 63, 37, 76, 43, 63, 189, 62, 62, 63, 227, 197, 45, 63, 143, 252, 59, 63, 1, 56, 48, 63, 34, 178, 57, 63, 101, 162, 50, 63, 144, 95, 55, 63, 243, 4, 53, 63, 243, 4, 53, 63, 144, 95, 55, 63, 101, 162, 50, 63, 34, 178, 57, 63, 1, 56, 48, 63, 143, 252, 59, 63, 227, 197, 45, 63, 189, 62, 62, 63, 37, 76, 43, 63, 147, 120, 64, 63, 227, 202, 40, 63, 247, 169, 66, 63, 58, 66, 38, 63, 209, 210, 68, 63, 70, 178, 35, 63, 10, 243, 70, 63, 36, 27, 33, 63, 136, 10, 73, 63, 241, 124, 30, 63, 52, 25, 75, 63, 202, 215, 27, 63, 248, 30, 77, 63, 205, 43, 25, 63, 189, 27, 79, 63, 24, 121, 22, 63, 108, 15, 81, 63, 202, 191, 19, 63, 239, 249, 82, 63, 0, 0, 17, 63, 49, 219, 84, 63, 218, 57, 14, 63, 29, 179, 86, 63, 119, 109, 11, 63, 158, 129, 88, 63, 246, 154, 8, 63, 160, 70, 90, 63, 119, 194, 5, 63, 15, 2, 92, 63, 27, 228, 2, 63, 215, 179, 93, 63, 0, 0, 0, 63, 230, 91, 95, 63, 144, 44, 250, 62, 40, 250, 96, 63, 39, 78, 244, 62, 141, 142, 98, 63, 7, 101, 238, 62, 1, 25, 100, 63, 113, 113, 232, 62, 116, 153, 101, 63, 170, 115, 226, 62, 212, 15, 103, 63, 243, 107, 220, 62, 18, 124, 104, 63, 146, 90, 214, 62, 30, 222, 105, 63, 201, 63, 208, 62, 231, 53, 107, 63, 222, 27, 202, 62, 94, 131, 108, 63, 21, 239, 195, 62, 118, 198, 109, 63, 180, 185, 189, 62, 33, 255, 110, 63, 1, 124, 183, 62, 79, 45, 112, 63, 65, 54, 177, 62, 244, 80, 113, 63, 188, 232, 170, 62, 3, 106, 114, 63, 183, 147, 164, 62, 113, 120, 115, 63, 122, 55, 158, 62, 48, 124, 116, 63, 76, 212, 151, 62, 54, 117, 117, 63, 117, 106, 145, 62, 119, 99, 118, 63, 62, 250, 138, 62, 234, 70, 119, 63, 238, 131, 132, 62, 132, 31, 120, 63, 156, 15, 124, 62, 60, 237, 120, 63, 77, 12, 111, 62, 9, 176, 121, 63, 130, 254, 97, 62, 226, 103, 122, 63, 205, 230, 84, 62, 190, 20, 123, 63, 194, 197, 71, 62, 152, 182, 123, 63, 243, 155, 58, 62, 103, 77, 124, 63, 245, 105, 45, 62, 37, 217, 124, 63, 92, 48, 32, 62, 203, 89, 125, 63, 187, 239, 18, 62, 85, 207, 125, 63, 168, 168, 5, 62, 188, 57, 126, 63, 115, 183, 240, 61, 253, 152, 126, 63, 4, 19, 214, 61, 18, 237, 126, 63, 51, 101, 187, 61, 249, 53, 127, 63, 42, 175, 160, 61, 175, 115, 127, 63, 19, 242, 133, 61, 47, 166, 127, 63, 58, 94, 86, 61, 121, 205, 127, 63, 231, 206, 32, 61, 139, 233, 127, 63, 10, 113, 214, 60, 99, 250, 127, 63, 191, 117, 86, 60, 0, 0, 24, 0, 48, 0, 72, 0, 96, 0, 8, 0, 32, 0, 56, 0, 80, 0, 104, 0, 16, 0, 40, 0, 64, 0, 88, 0, 112, 0, 4, 0, 28, 0, 52, 0, 76, 0, 100, 0, 12, 0, 36, 0, 60, 0, 84, 0, 108, 0, 20, 0, 44, 0, 68, 0, 92, 0, 116, 0, 1, 0, 25, 0, 49, 0, 73, 0, 97, 0, 9, 0, 33, 0, 57, 0, 81, 0, 105, 0, 17, 0, 41, 0, 65, 0, 89, 0, 113, 0, 5, 0, 29, 0, 53, 0, 77, 0, 101, 0, 13, 0, 37, 0, 61, 0, 85, 0, 109, 0, 21, 0, 45, 0, 69, 0, 93, 0, 117, 0, 2, 0, 26, 0, 50, 0, 74, 0, 98, 0, 10, 0, 34, 0, 58, 0, 82, 0, 106, 0, 18, 0, 42, 0, 66, 0, 90, 0, 114, 0, 6, 0, 30, 0, 54, 0, 78, 0, 102, 0, 14, 0, 38, 0, 62, 0, 86, 0, 110, 0, 22, 0, 46, 0, 70, 0, 94, 0, 118, 0, 3, 0, 27, 0, 51, 0, 75, 0, 99, 0, 11, 0, 35, 0, 59, 0, 83, 0, 107, 0, 19, 0, 43, 0, 67, 0, 91, 0, 115, 0, 7, 0, 31, 0, 55, 0, 79, 0, 103, 0, 15, 0, 39, 0, 63, 0, 87, 0, 111, 0, 23, 0, 47, 0, 71, 0, 95, 0, 119, 0, 0, 0, 48, 0, 96, 0, 144, 0, 192, 0, 16, 0, 64, 0, 112, 0, 160, 0, 208, 0, 32, 0, 80, 0, 128, 0, 176, 0, 224, 0, 4, 0, 52, 0, 100, 0, 148, 0, 196, 0, 20, 0, 68, 0, 116, 0, 164, 0, 212, 0, 36, 0, 84, 0, 132, 0, 180, 0, 228, 0, 8, 0, 56, 0, 104, 0, 152, 0, 200, 0, 24, 0, 72, 0, 120, 0, 168, 0, 216, 0, 40, 0, 88, 0, 136, 0, 184, 0, 232, 0, 12, 0, 60, 0, 108, 0, 156, 0, 204, 0, 28, 0, 76, 0, 124, 0, 172, 0, 220, 0, 44, 0, 92, 0, 140, 0, 188, 0, 236, 0, 1, 0, 49, 0, 97, 0, 145, 0, 193, 0, 17, 0, 65, 0, 113, 0, 161, 0, 209, 0, 33, 0, 81, 0, 129, 0, 177, 0, 225, 0, 5, 0, 53, 0, 101, 0, 149, 0, 197, 0, 21, 0, 69, 0, 117, 0, 165, 0, 213, 0, 37, 0, 85, 0, 133, 0, 181, 0, 229, 0, 9, 0, 57, 0, 105, 0, 153, 0, 201, 0, 25, 0, 73, 0, 121, 0, 169, 0, 217, 0, 41, 0, 89, 0, 137, 0, 185, 0, 233, 0, 13, 0, 61, 0, 109, 0, 157, 0, 205, 0, 29, 0, 77, 0, 125, 0, 173, 0, 221, 0, 45, 0, 93, 0, 141, 0, 189, 0, 237, 0, 2, 0, 50, 0, 98, 0, 146, 0, 194, 0, 18, 0, 66, 0, 114, 0, 162, 0, 210, 0, 34, 0, 82, 0, 130, 0, 178, 0, 226, 0, 6, 0, 54, 0, 102, 0, 150, 0, 198, 0, 22, 0, 70, 0, 118, 0, 166, 0, 214, 0, 38, 0, 86, 0, 134, 0, 182, 0, 230, 0, 10, 0, 58, 0, 106, 0, 154, 0, 202, 0, 26, 0, 74, 0, 122, 0, 170, 0, 218, 0, 42, 0, 90, 0, 138, 0, 186, 0, 234, 0, 14, 0, 62, 0, 110, 0, 158, 0, 206, 0, 30, 0, 78, 0, 126, 0, 174, 0, 222, 0, 46, 0, 94, 0, 142, 0, 190, 0, 238, 0, 3, 0, 51, 0, 99, 0, 147, 0, 195, 0, 19, 0, 67, 0, 115, 0, 163, 0, 211, 0, 35, 0, 83, 0, 131, 0, 179, 0, 227, 0, 7, 0, 55, 0, 103, 0, 151, 0, 199, 0, 23, 0, 71, 0, 119, 0, 167, 0, 215, 0, 39, 0, 87, 0, 135, 0, 183, 0, 231, 0, 11, 0, 59, 0, 107, 0, 155, 0, 203, 0, 27, 0, 75, 0, 123, 0, 171, 0, 219, 0, 43, 0, 91, 0, 139, 0, 187, 0, 235, 0, 15, 0, 63, 0, 111, 0, 159, 0, 207, 0, 31, 0, 79, 0, 127, 0, 175, 0, 223, 0, 47, 0, 95, 0, 143, 0, 191, 0, 239, 0, 0, 0, 96, 0, 192, 0, 32, 1, 128, 1, 32, 0, 128, 0, 224, 0, 64, 1, 160, 1, 64, 0, 160, 0, 0, 1, 96, 1, 192, 1, 8, 0, 104, 0, 200, 0, 40, 1, 136, 1, 40, 0, 136, 0, 232, 0, 72, 1, 168, 1, 72, 0, 168, 0, 8, 1, 104, 1, 200, 1, 16, 0, 112, 0, 208, 0, 48, 1, 144, 1, 48, 0, 144, 0, 240, 0, 80, 1, 176, 1, 80, 0, 176, 0, 16, 1, 112, 1, 208, 1, 24, 0, 120, 0, 216, 0, 56, 1, 152, 1, 56, 0, 152, 0, 248, 0, 88, 1, 184, 1, 88, 0, 184, 0, 24, 1, 120, 1, 216, 1, 4, 0, 100, 0, 196, 0, 36, 1, 132, 1, 36, 0, 132, 0, 228, 0, 68, 1, 164, 1, 68, 0, 164, 0, 4, 1, 100, 1, 196, 1, 12, 0, 108, 0, 204, 0, 44, 1, 140, 1, 44, 0, 140, 0, 236, 0, 76, 1, 172, 1, 76, 0, 172, 0, 12, 1, 108, 1, 204, 1, 20, 0, 116, 0, 212, 0, 52, 1, 148, 1, 52, 0, 148, 0, 244, 0, 84, 1, 180, 1, 84, 0, 180, 0, 20, 1, 116, 1, 212, 1, 28, 0, 124, 0, 220, 0, 60, 1, 156, 1, 60, 0, 156, 0, 252, 0, 92, 1, 188, 1, 92, 0, 188, 0, 28, 1, 124, 1, 220, 1, 1, 0, 97, 0, 193, 0, 33, 1, 129, 1, 33, 0, 129, 0, 225, 0, 65, 1, 161, 1, 65, 0, 161, 0, 1, 1, 97, 1, 193, 1, 9, 0, 105, 0, 201, 0, 41, 1, 137, 1, 41, 0, 137, 0, 233, 0, 73, 1, 169, 1, 73, 0, 169, 0, 9, 1, 105, 1, 201, 1, 17, 0, 113, 0, 209, 0, 49, 1, 145, 1, 49, 0, 145, 0, 241, 0, 81, 1, 177, 1, 81, 0, 177, 0, 17, 1, 113, 1, 209, 1, 25, 0, 121, 0, 217, 0, 57, 1, 153, 1, 57, 0, 153, 0, 249, 0, 89, 1, 185, 1, 89, 0, 185, 0, 25, 1, 121, 1, 217, 1, 5, 0, 101, 0, 197, 0, 37, 1, 133, 1, 37, 0, 133, 0, 229, 0, 69, 1, 165, 1, 69, 0, 165, 0, 5, 1, 101, 1, 197, 1, 13, 0, 109, 0, 205, 0, 45, 1, 141, 1, 45, 0, 141, 0, 237, 0, 77, 1, 173, 1, 77, 0, 173, 0, 13, 1, 109, 1, 205, 1, 21, 0, 117, 0, 213, 0, 53, 1, 149, 1, 53, 0, 149, 0, 245, 0, 85, 1, 181, 1, 85, 0, 181, 0, 21, 1, 117, 1, 213, 1, 29, 0, 125, 0, 221, 0, 61, 1, 157, 1, 61, 0, 157, 0, 253, 0, 93, 1, 189, 1, 93, 0, 189, 0, 29, 1, 125, 1, 221, 1, 2, 0, 98, 0, 194, 0, 34, 1, 130, 1, 34, 0, 130, 0, 226, 0, 66, 1, 162, 1, 66, 0, 162, 0, 2, 1, 98, 1, 194, 1, 10, 0, 106, 0, 202, 0, 42, 1, 138, 1, 42, 0, 138, 0, 234, 0, 74, 1, 170, 1, 74, 0, 170, 0, 10, 1, 106, 1, 202, 1, 18, 0, 114, 0, 210, 0, 50, 1, 146, 1, 50, 0, 146, 0, 242, 0, 82, 1, 178, 1, 82, 0, 178, 0, 18, 1, 114, 1, 210, 1, 26, 0, 122, 0, 218, 0, 58, 1, 154, 1, 58, 0, 154, 0, 250, 0, 90, 1, 186, 1, 90, 0, 186, 0, 26, 1, 122, 1, 218, 1, 6, 0, 102, 0, 198, 0, 38, 1, 134, 1, 38, 0, 134, 0, 230, 0, 70, 1, 166, 1, 70, 0, 166, 0, 6, 1, 102, 1, 198, 1, 14, 0, 110, 0, 206, 0, 46, 1, 142, 1, 46, 0, 142, 0, 238, 0, 78, 1, 174, 1, 78, 0, 174, 0, 14, 1, 110, 1, 206, 1, 22, 0, 118, 0, 214, 0, 54, 1, 150, 1, 54, 0, 150, 0, 246, 0, 86, 1, 182, 1, 86, 0, 182, 0, 22, 1, 118, 1, 214, 1, 30, 0, 126, 0, 222, 0, 62, 1, 158, 1, 62, 0, 158, 0, 254, 0, 94, 1, 190, 1, 94, 0, 190, 0, 30, 1, 126, 1, 222, 1, 3, 0, 99, 0, 195, 0, 35, 1, 131, 1, 35, 0, 131, 0, 227, 0, 67, 1, 163, 1, 67, 0, 163, 0, 3, 1, 99, 1, 195, 1, 11, 0, 107, 0, 203, 0, 43, 1, 139, 1, 43, 0, 139, 0, 235, 0, 75, 1, 171, 1, 75, 0, 171, 0, 11, 1, 107, 1, 203, 1, 19, 0, 115, 0, 211, 0, 51, 1, 147, 1, 51, 0, 147, 0, 243, 0, 83, 1, 179, 1, 83, 0, 179, 0, 19, 1, 115, 1, 211, 1, 27, 0, 123, 0, 219, 0, 59, 1, 155, 1, 59, 0, 155, 0, 251, 0, 91, 1, 187, 1, 91, 0, 187, 0, 27, 1, 123, 1, 219, 1, 7, 0, 103, 0, 199, 0, 39, 1, 135, 1, 39, 0, 135, 0, 231], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 10240);
allocate([71, 1, 167, 1, 71, 0, 167, 0, 7, 1, 103, 1, 199, 1, 15, 0, 111, 0, 207, 0, 47, 1, 143, 1, 47, 0, 143, 0, 239, 0, 79, 1, 175, 1, 79, 0, 175, 0, 15, 1, 111, 1, 207, 1, 23, 0, 119, 0, 215, 0, 55, 1, 151, 1, 55, 0, 151, 0, 247, 0, 87, 1, 183, 1, 87, 0, 183, 0, 23, 1, 119, 1, 215, 1, 31, 0, 127, 0, 223, 0, 63, 1, 159, 1, 63, 0, 159, 0, 255, 0, 95, 1, 191, 1, 95, 0, 191, 0, 31, 1, 127, 1, 223, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 206, 64, 0, 0, 200, 64, 0, 0, 184, 64, 0, 0, 170, 64, 0, 0, 162, 64, 0, 0, 154, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 156, 64, 0, 0, 150, 64, 0, 0, 146, 64, 0, 0, 142, 64, 0, 0, 156, 64, 0, 0, 148, 64, 0, 0, 138, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 148, 64, 0, 0, 152, 64, 0, 0, 142, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 0, 0, 72, 127, 65, 129, 66, 128, 65, 128, 64, 128, 62, 128, 64, 128, 64, 128, 92, 78, 92, 79, 92, 78, 90, 79, 116, 41, 115, 40, 114, 40, 132, 26, 132, 26, 145, 17, 161, 12, 176, 10, 177, 11, 24, 179, 48, 138, 54, 135, 54, 132, 53, 134, 56, 133, 55, 132, 55, 132, 61, 114, 70, 96, 74, 88, 75, 88, 87, 74, 89, 66, 91, 67, 100, 59, 108, 50, 120, 40, 122, 37, 97, 43, 78, 50, 83, 78, 84, 81, 88, 75, 86, 74, 87, 71, 90, 73, 93, 74, 93, 74, 109, 40, 114, 36, 117, 34, 117, 34, 143, 17, 145, 18, 146, 19, 162, 12, 165, 10, 178, 7, 189, 6, 190, 8, 177, 9, 23, 178, 54, 115, 63, 102, 66, 98, 69, 99, 74, 89, 71, 91, 73, 91, 78, 89, 86, 80, 92, 66, 93, 64, 102, 59, 103, 60, 104, 60, 117, 52, 123, 44, 138, 35, 133, 31, 97, 38, 77, 45, 61, 90, 93, 60, 105, 42, 107, 41, 110, 45, 116, 38, 113, 38, 112, 38, 124, 26, 132, 27, 136, 19, 140, 20, 155, 14, 159, 16, 158, 18, 170, 13, 177, 10, 187, 8, 192, 6, 175, 9, 159, 10, 21, 178, 59, 110, 71, 86, 75, 85, 84, 83, 91, 66, 88, 73, 87, 72, 92, 75, 98, 72, 105, 58, 107, 54, 115, 52, 114, 55, 112, 56, 129, 51, 132, 40, 150, 33, 140, 29, 98, 35, 77, 42, 42, 121, 96, 66, 108, 43, 111, 40, 117, 44, 123, 32, 120, 36, 119, 33, 127, 33, 134, 34, 139, 21, 147, 23, 152, 20, 158, 25, 154, 26, 166, 21, 173, 16, 184, 13, 184, 10, 150, 13, 139, 15, 22, 178, 63, 114, 74, 82, 84, 83, 92, 82, 103, 62, 96, 72, 96, 67, 101, 73, 107, 72, 113, 55, 118, 52, 125, 52, 118, 52, 117, 55, 135, 49, 137, 39, 157, 32, 145, 29, 97, 33, 77, 40, 0, 0, 102, 63, 0, 0, 76, 63, 0, 0, 38, 63, 0, 0, 0, 63, 0, 134, 107, 63, 0, 20, 46, 63, 0, 112, 189, 62, 0, 208, 76, 62, 2, 1, 0, 0, 0, 0, 0, 0, 0, 8, 13, 16, 19, 21, 23, 24, 26, 27, 28, 29, 30, 31, 32, 32, 33, 34, 34, 35, 36, 36, 37, 37, 15, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 15, 8, 7, 4, 11, 12, 3, 2, 13, 10, 5, 6, 9, 14, 1, 0, 9, 6, 3, 4, 5, 8, 1, 2, 7, 0, 0, 0, 0, 0, 0, 184, 126, 154, 121, 0, 0, 0, 0, 154, 121, 102, 102, 0, 0, 0, 0, 184, 126, 51, 115, 0, 0, 0, 0, 48, 117, 0, 0, 112, 23, 0, 0, 32, 209, 255, 255, 32, 209, 255, 255, 6, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 255, 1, 255, 2, 254, 2, 254, 3, 253, 0, 1, 0, 1, 255, 2, 255, 2, 254, 3, 254, 3, 253, 7, 254, 7, 0, 0, 0, 0, 0, 2, 255, 255, 255, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 255, 2, 1, 0, 1, 1, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 1, 255, 0, 1, 255, 0, 255, 1, 254, 2, 254, 254, 2, 253, 2, 3, 253, 252, 3, 252, 4, 4, 251, 5, 250, 251, 6, 249, 6, 5, 8, 247, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 255, 1, 0, 0, 1, 255, 0, 1, 255, 255, 1, 255, 2, 1, 255, 2, 254, 254, 2, 254, 2, 2, 3, 253, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 255, 1, 0, 0, 2, 1, 255, 2, 255, 255, 2, 255, 2, 2, 255, 3, 254, 254, 254, 3, 0, 1, 0, 0, 1, 0, 1, 255, 2, 255, 2, 255, 2, 3, 254, 3, 254, 254, 4, 4, 253, 5, 253, 252, 6, 252, 6, 5, 251, 8, 250, 251, 249, 9, 251, 8, 255, 6, 255, 6, 252, 10, 250, 10, 254, 6, 255, 6, 251, 10, 247, 12, 253, 7, 254, 7, 249, 13, 16, 24, 34, 0, 0, 0, 0, 0, 6, 0, 3, 0, 7, 3, 0, 1, 10, 0, 2, 6, 18, 10, 12, 0, 4, 0, 2, 0, 0, 0, 9, 4, 7, 4, 0, 3, 12, 7, 7, 0, 42, 175, 213, 201, 207, 255, 64, 0, 17, 0, 99, 255, 97, 1, 16, 254, 163, 0, 39, 43, 189, 86, 217, 255, 6, 0, 91, 0, 86, 255, 186, 0, 23, 0, 128, 252, 192, 24, 216, 77, 237, 255, 220, 255, 102, 0, 167, 255, 232, 255, 72, 1, 73, 252, 8, 10, 37, 62, 0, 0, 0, 0, 0, 0, 135, 199, 61, 201, 64, 0, 128, 0, 134, 255, 36, 0, 54, 1, 0, 253, 72, 2, 51, 36, 69, 69, 12, 0, 128, 0, 18, 0, 114, 255, 32, 1, 139, 255, 159, 252, 27, 16, 123, 56, 104, 2, 13, 200, 246, 255, 39, 0, 58, 0, 210, 255, 172, 255, 120, 0, 184, 0, 197, 254, 227, 253, 4, 5, 4, 21, 64, 35, 0, 0, 0, 0, 230, 62, 198, 196, 243, 255, 0, 0, 20, 0, 26, 0, 5, 0, 225, 255, 213, 255, 252, 255, 65, 0, 90, 0, 7, 0, 99, 255, 8, 255, 212, 255, 81, 2, 47, 6, 52, 10, 199, 12, 228, 87, 5, 197, 3, 0, 242, 255, 236, 255, 241, 255, 2, 0, 25, 0, 37, 0, 25, 0, 240, 255, 185, 255, 149, 255, 177, 255, 50, 0, 36, 1, 111, 2, 214, 3, 8, 5, 184, 5, 148, 107, 103, 196, 17, 0, 12, 0, 8, 0, 1, 0, 246, 255, 234, 255, 226, 255, 224, 255, 234, 255, 3, 0, 44, 0, 100, 0, 168, 0, 243, 0, 61, 1, 125, 1, 173, 1, 199, 1, 19, 245, 149, 230, 89, 18, 243, 41, 31, 6, 84, 32, 0, 0, 0, 0, 189, 0, 168, 253, 105, 2, 103, 119, 117, 0, 97, 255, 210, 251, 8, 116, 52, 0, 221, 0, 168, 246, 116, 110, 252, 255, 17, 2, 234, 242, 229, 102, 208, 255, 246, 2, 140, 240, 165, 93, 176, 255, 137, 3, 117, 239, 6, 83, 157, 255, 204, 3, 130, 239, 102, 71, 149, 255, 199, 3, 139, 240, 39, 59, 153, 255, 128, 3, 97, 242, 174, 46, 165, 255, 5, 3, 207, 244, 94, 34, 185, 255, 99, 2, 161, 247, 152, 22, 210, 255, 169, 1, 161, 250, 180, 11, 0, 64, 0, 0, 108, 34, 0, 0, 66, 15, 0, 0, 18, 6, 0, 0, 77, 2, 0, 0, 219, 0, 0, 0, 237, 0, 0, 0, 153, 0, 0, 0, 73, 0, 0, 0, 30, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 0, 64, 0, 0, 147, 93, 0, 0, 189, 112, 0, 0, 237, 121, 0, 0, 178, 125, 0, 0, 36, 127, 0, 0, 0, 32, 254, 31, 246, 31, 234, 31, 216, 31, 194, 31, 168, 31, 136, 31, 98, 31, 58, 31, 10, 31, 216, 30, 160, 30, 98, 30, 34, 30, 220, 29, 144, 29, 66, 29, 238, 28, 150, 28, 58, 28, 216, 27, 114, 27, 10, 27, 156, 26, 42, 26, 180, 25, 58, 25, 188, 24, 60, 24, 182, 23, 46, 23, 160, 22, 16, 22, 126, 21, 232, 20, 78, 20, 176, 19, 16, 19, 110, 18, 200, 17, 30, 17, 116, 16, 198, 15, 22, 15, 100, 14, 174, 13, 248, 12, 64, 12, 132, 11, 200, 10, 10, 10, 74, 9, 138, 8, 198, 7, 2, 7, 62, 6, 120, 5, 178, 4, 234, 3, 34, 3, 90, 2, 146, 1, 202, 0, 0, 0, 54, 255, 110, 254, 166, 253, 222, 252, 22, 252, 78, 251, 136, 250, 194, 249, 254, 248, 58, 248, 118, 247, 182, 246, 246, 245, 56, 245, 124, 244, 192, 243, 8, 243, 82, 242, 156, 241, 234, 240, 58, 240, 140, 239, 226, 238, 56, 238, 146, 237, 240, 236, 80, 236, 178, 235, 24, 235, 130, 234, 240, 233, 96, 233, 210, 232, 74, 232, 196, 231, 68, 231, 198, 230, 76, 230, 214, 229, 100, 229, 246, 228, 142, 228, 40, 228, 198, 227, 106, 227, 18, 227, 190, 226, 112, 226, 36, 226, 222, 225, 158, 225, 96, 225, 40, 225, 246, 224, 198, 224, 158, 224, 120, 224, 88, 224, 62, 224, 40, 224, 22, 224, 10, 224, 2, 224, 0, 224, 0, 0, 0, 0, 0, 0, 179, 99, 0, 0, 0, 0, 0, 0, 71, 56, 43, 30, 21, 12, 6, 0, 199, 165, 144, 124, 109, 96, 84, 71, 61, 51, 42, 32, 23, 15, 8, 0, 241, 225, 211, 199, 187, 175, 164, 153, 142, 132, 123, 114, 105, 96, 88, 80, 72, 64, 57, 50, 44, 38, 33, 29, 24, 20, 16, 12, 9, 5, 2, 0, 248, 86, 0, 0, 0, 87, 0, 0, 16, 87, 0, 0, 0, 0, 0, 0, 15, 131, 138, 138, 155, 155, 173, 173, 69, 93, 115, 118, 131, 138, 141, 138, 150, 150, 155, 150, 155, 160, 166, 160, 131, 128, 134, 141, 141, 141, 145, 145, 145, 150, 155, 155, 155, 155, 160, 160, 160, 160, 166, 166, 173, 173, 182, 192, 182, 192, 192, 192, 205, 192, 205, 224, 64, 87, 0, 0, 72, 87, 0, 0, 88, 87, 0, 0, 0, 0, 0, 0, 4, 6, 24, 7, 5, 0, 0, 2, 0, 0, 12, 28, 41, 13, 252, 247, 15, 42, 25, 14, 1, 254, 62, 41, 247, 246, 37, 65, 252, 3, 250, 4, 66, 7, 248, 16, 14, 38, 253, 33, 13, 22, 39, 23, 12, 255, 36, 64, 27, 250, 249, 10, 55, 43, 17, 1, 1, 8, 1, 1, 6, 245, 74, 53, 247, 244, 55, 76, 244, 8, 253, 3, 93, 27, 252, 26, 39, 59, 3, 248, 2, 0, 77, 11, 9, 248, 22, 44, 250, 7, 40, 9, 26, 3, 9, 249, 20, 101, 249, 4, 3, 248, 42, 26, 0, 241, 33, 68, 2, 23, 254, 55, 46, 254, 15, 3, 255, 21, 16, 41, 250, 27, 61, 39, 5, 245, 42, 88, 4, 1, 254, 60, 65, 6, 252, 255, 251, 73, 56, 1, 247, 19, 94, 29, 247, 0, 12, 99, 6, 4, 8, 237, 102, 46, 243, 3, 2, 13, 3, 2, 9, 235, 84, 72, 238, 245, 46, 104, 234, 8, 18, 38, 48, 23, 0, 240, 70, 83, 235, 11, 5, 245, 117, 22, 248, 250, 23, 117, 244, 3, 3, 248, 95, 28, 4, 246, 15, 77, 60, 241, 255, 4, 124, 2, 252, 3, 38, 84, 24, 231, 2, 13, 42, 13, 31, 21, 252, 56, 46, 255, 255, 35, 79, 243, 19, 249, 65, 88, 247, 242, 20, 4, 81, 49, 227, 20, 0, 75, 3, 239, 5, 247, 44, 92, 248, 1, 253, 22, 69, 31, 250, 95, 41, 244, 5, 39, 67, 16, 252, 1, 0, 250, 120, 55, 220, 243, 44, 122, 4, 232, 81, 5, 11, 3, 7, 2, 0, 9, 10, 88, 136, 87, 0, 0, 176, 87, 0, 0, 0, 88, 0, 0, 0, 0, 0, 0, 46, 2, 90, 87, 93, 91, 82, 98, 109, 120, 118, 12, 113, 115, 117, 119, 99, 59, 87, 111, 63, 111, 112, 80, 126, 124, 125, 124, 129, 121, 126, 23, 132, 127, 127, 127, 126, 127, 122, 133, 130, 134, 101, 118, 119, 145, 126, 86, 124, 120, 123, 119, 170, 173, 107, 109, 176, 88, 0, 0, 184, 88, 0, 0, 200, 88, 0, 0, 0, 0, 0, 0, 8, 16, 32, 0, 0, 0, 0, 0, 12, 35, 60, 83, 108, 132, 157, 180, 206, 228, 15, 32, 55, 77, 101, 125, 151, 175, 201, 225, 19, 42, 66, 89, 114, 137, 162, 184, 209, 230, 12, 25, 50, 72, 97, 120, 147, 172, 200, 223, 26, 44, 69, 90, 114, 135, 159, 180, 205, 225, 13, 22, 53, 80, 106, 130, 156, 180, 205, 228, 15, 25, 44, 64, 90, 115, 142, 168, 196, 222, 19, 24, 62, 82, 100, 120, 145, 168, 190, 214, 22, 31, 50, 79, 103, 120, 151, 170, 203, 227, 21, 29, 45, 65, 106, 124, 150, 171, 196, 224, 30, 49, 75, 97, 121, 142, 165, 186, 209, 229, 19, 25, 52, 70, 93, 116, 143, 166, 192, 219, 26, 34, 62, 75, 97, 118, 145, 167, 194, 217, 25, 33, 56, 70, 91, 113, 143, 165, 196, 223, 21, 34, 51, 72, 97, 117, 145, 171, 196, 222, 20, 29, 50, 67, 90, 117, 144, 168, 197, 221, 22, 31, 48, 66, 95, 117, 146, 168, 196, 222, 24, 33, 51, 77, 116, 134, 158, 180, 200, 224, 21, 28, 70, 87, 106, 124, 149, 170, 194, 217, 26, 33, 53, 64, 83, 117, 152, 173, 204, 225, 27, 34, 65, 95, 108, 129, 155, 174, 210, 225, 20, 26, 72, 99, 113, 131, 154, 176, 200, 219, 34, 43, 61, 78, 93, 114, 155, 177, 205, 229, 23, 29, 54, 97, 124, 138, 163, 179, 209, 229, 30, 38, 56, 89, 118, 129, 158, 178, 200, 231, 21, 29, 49, 63, 85, 111, 142, 163, 193, 222, 27, 48, 77, 103, 133, 158, 179, 196, 215, 232, 29, 47, 74, 99, 124, 151, 176, 198, 220, 237, 33, 42, 61, 76, 93, 121, 155, 174, 207, 225, 29, 53, 87, 112, 136, 154, 170, 188, 208, 227, 24, 30, 52, 84, 131, 150, 166, 186, 203, 229, 37, 48, 64, 84, 104, 118, 156, 177, 201, 230, 212, 178, 148, 129, 108, 96, 85, 82, 79, 77, 61, 59, 57, 56, 51, 49, 48, 45, 42, 41, 40, 38, 36, 34, 31, 30, 21, 12, 10, 3, 1, 0, 255, 245, 244, 236, 233, 225, 217, 203, 190, 176, 175, 161, 149, 136, 125, 114, 102, 91, 81, 71, 60, 52, 43, 35, 28, 20, 19, 18, 12, 11, 5, 0, 179, 138, 140, 148, 151, 149, 153, 151, 163, 116, 67, 82, 59, 92, 72, 100, 89, 92, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 99, 66, 36, 36, 34, 36, 34, 34, 34, 34, 83, 69, 36, 52, 34, 116, 102, 70, 68, 68, 176, 102, 68, 68, 34, 65, 85, 68, 84, 36, 116, 141, 152, 139, 170, 132, 187, 184, 216, 137, 132, 249, 168, 185, 139, 104, 102, 100, 68, 68, 178, 218, 185, 185, 170, 244, 216, 187, 187, 170, 244, 187, 187, 219, 138, 103, 155, 184, 185, 137, 116, 183, 155, 152, 136, 132, 217, 184, 184, 170, 164, 217, 171, 155, 139, 244, 169, 184, 185, 170, 164, 216, 223, 218, 138, 214, 143, 188, 218, 168, 244, 141, 136, 155, 170, 168, 138, 220, 219, 139, 164, 219, 202, 216, 137, 168, 186, 246, 185, 139, 116, 185, 219, 185, 138, 100, 100, 134, 100, 102, 34, 68, 68, 100, 68, 168, 203, 221, 218, 168, 167, 154, 136, 104, 70, 164, 246, 171, 137, 139, 137, 155, 218, 219, 139, 255, 254, 253, 238, 14, 3, 2, 1, 0, 255, 254, 252, 218, 35, 3, 2, 1, 0, 255, 254, 250, 208, 59, 4, 2, 1, 0, 255, 254, 246, 194, 71, 10, 2, 1, 0, 255, 252, 236, 183, 82, 8, 2, 1, 0, 255, 252, 235, 180, 90, 17, 2, 1, 0, 255, 248, 224, 171, 97, 30, 4, 1, 0, 255, 254, 236, 173, 95, 37, 7, 1, 0, 255, 255, 255, 131, 6, 145, 255, 255, 255, 255, 255, 236, 93, 15, 96, 255, 255, 255, 255, 255, 194, 83, 25, 71, 221, 255, 255, 255, 255, 162, 73, 34, 66, 162, 255, 255, 255, 210, 126, 73, 43, 57, 173, 255, 255, 255, 201, 125, 71, 48, 58, 130, 255, 255, 255, 166, 110, 73, 57, 62, 104, 210, 255, 255, 251, 123, 65, 55, 68, 100, 171, 255, 250, 0, 3, 0, 6, 0, 3, 0, 3, 0, 3, 0, 4, 0, 3, 0, 3, 0, 3, 0, 205, 1, 0, 0, 32, 0, 10, 0, 20, 46, 100, 1, 0, 89, 0, 0, 64, 90, 0, 0, 128, 90, 0, 0, 152, 90, 0, 0, 56, 91, 0, 0, 128, 91, 0, 0, 200, 91, 0, 0, 0, 0, 0, 0, 7, 23, 38, 54, 69, 85, 100, 116, 131, 147, 162, 178, 193, 208, 223, 239, 13, 25, 41, 55, 69, 83, 98, 112, 127, 142, 157, 171, 187, 203, 220, 236, 15, 21, 34, 51, 61, 78, 92, 106, 126, 136, 152, 167, 185, 205, 225, 240, 10, 21, 36, 50, 63, 79, 95, 110, 126, 141, 157, 173, 189, 205, 221, 237, 17, 20, 37, 51, 59, 78, 89, 107, 123, 134, 150, 164, 184, 205, 224, 240, 10, 15, 32, 51, 67, 81, 96, 112, 129, 142, 158, 173, 189, 204, 220, 236, 8, 21, 37, 51, 65, 79, 98, 113, 126, 138, 155, 168, 179, 192, 209, 218, 12, 15, 34, 55, 63, 78, 87, 108, 118, 131, 148, 167, 185, 203, 219, 236, 16, 19, 32, 36, 56, 79, 91, 108, 118, 136, 154, 171, 186, 204, 220, 237, 11, 28, 43, 58, 74, 89, 105, 120, 135, 150, 165, 180, 196, 211, 226, 241, 6, 16, 33, 46, 60, 75, 92, 107, 123, 137, 156, 169, 185, 199, 214, 225, 11, 19, 30, 44, 57, 74, 89, 105, 121, 135, 152, 169, 186, 202, 218, 234, 12, 19, 29, 46, 57, 71, 88, 100, 120, 132, 148, 165, 182, 199, 216, 233, 17, 23, 35, 46, 56, 77, 92, 106, 123, 134, 152, 167, 185, 204, 222, 237, 14, 17, 45, 53, 63, 75, 89, 107, 115, 132, 151, 171, 188, 206, 221, 240, 9, 16, 29, 40, 56, 71, 88, 103, 119, 137, 154, 171, 189, 205, 222, 237, 16, 19, 36, 48, 57, 76, 87, 105, 118, 132, 150, 167, 185, 202, 218, 236, 12, 17, 29, 54, 71, 81, 94, 104, 126, 136, 149, 164, 182, 201, 221, 237, 15, 28, 47, 62, 79, 97, 115, 129, 142, 155, 168, 180, 194, 208, 223, 238, 8, 14, 30, 45, 62, 78, 94, 111, 127, 143, 159, 175, 192, 207, 223, 239, 17, 30, 49, 62, 79, 92, 107, 119, 132, 145, 160, 174, 190, 204, 220, 235, 14, 19, 36, 45, 61, 76, 91, 108, 121, 138, 154, 172, 189, 205, 222, 238, 12, 18, 31, 45, 60, 76, 91, 107, 123, 138, 154, 171, 187, 204, 221, 236, 13, 17, 31, 43, 53, 70, 83, 103, 114, 131, 149, 167, 185, 203, 220, 237, 17, 22, 35, 42, 58, 78, 93, 110, 125, 139, 155, 170, 188, 206, 224, 240, 8, 15, 34, 50, 67, 83, 99, 115, 131, 146, 162, 178, 193, 209, 224, 239, 13, 16, 41, 66, 73, 86, 95, 111, 128, 137, 150, 163, 183, 206, 225, 241, 17, 25, 37, 52, 63, 75, 92, 102, 119, 132, 144, 160, 175, 191, 212, 231, 19, 31, 49, 65, 83, 100, 117, 133, 147, 161, 174, 187, 200, 213, 227, 242, 18, 31, 52, 68, 88, 103, 117, 126, 138, 149, 163, 177, 192, 207, 223, 239, 16, 29, 47, 61, 76, 90, 106, 119, 133, 147, 161, 176, 193, 209, 224, 240, 15, 21, 35, 50, 61, 73, 86, 97, 110, 119, 129, 141, 175, 198, 218, 237, 225, 204, 201, 184, 183, 175, 158, 154, 153, 135, 119, 115, 113, 110, 109, 99, 98, 95, 79, 68, 52, 50, 48, 45, 43, 32, 31, 27, 18, 10, 3, 0, 255, 251, 235, 230, 212, 201, 196, 182, 167, 166, 163, 151, 138, 124, 110, 104, 90, 78, 76, 70, 69, 57, 45, 34, 24, 21, 11, 6, 5, 4, 3, 0, 175, 148, 160, 176, 178, 173, 174, 164, 177, 174, 196, 182, 198, 192, 182, 68, 62, 66, 60, 72, 117, 85, 90, 118, 136, 151, 142, 160, 142, 155, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 100, 102, 102, 68, 68, 36, 34, 96, 164, 107, 158, 185, 180, 185, 139, 102, 64, 66, 36, 34, 34, 0, 1, 32, 208, 139, 141, 191, 152, 185, 155, 104, 96, 171, 104, 166, 102, 102, 102, 132, 1, 0, 0, 0, 0, 16, 16, 0, 80, 109, 78, 107, 185, 139, 103, 101, 208, 212, 141, 139, 173, 153, 123, 103, 36, 0, 0, 0, 0, 0, 0, 1, 48, 0, 0, 0, 0, 0, 0, 32, 68, 135, 123, 119, 119, 103, 69, 98, 68, 103, 120, 118, 118, 102, 71, 98, 134, 136, 157, 184, 182, 153, 139, 134, 208, 168, 248, 75, 189, 143, 121, 107, 32, 49, 34, 34, 34, 0, 17, 2, 210, 235, 139, 123, 185, 137, 105, 134, 98, 135, 104, 182, 100, 183, 171, 134, 100, 70, 68, 70, 66, 66, 34, 131, 64, 166, 102, 68, 36, 2, 1, 0, 134, 166, 102, 68, 34, 34, 66, 132, 212, 246, 158, 139, 107, 107, 87, 102, 100, 219, 125, 122, 137, 118, 103, 132, 114, 135, 137, 105, 171, 106, 50, 34, 164, 214, 141, 143, 185, 151, 121, 103, 192, 34, 0, 0, 0, 0, 0, 1, 208, 109, 74, 187, 134, 249, 159, 137, 102, 110, 154, 118, 87, 101, 119, 101, 0, 2, 0, 36, 36, 66, 68, 35, 96, 164, 102, 100, 36, 0, 2, 33, 167, 138, 174, 102, 100, 84, 2, 2, 100, 107, 120, 119, 36, 197, 24, 0, 255, 254, 253, 244, 12, 3, 2, 1, 0, 255, 254, 252, 224, 38, 3, 2, 1, 0, 255, 254, 251, 209, 57, 4, 2, 1, 0, 255, 254, 244, 195, 69, 4, 2, 1, 0, 255, 251, 232, 184, 84, 7, 2, 1, 0, 255, 254, 240, 186, 86, 14, 2, 1, 0, 255, 254, 239, 178, 91, 30, 5, 1, 0, 255, 248, 227, 177, 100, 19, 2, 1, 0, 255, 255, 255, 156, 4, 154, 255, 255, 255, 255, 255, 227, 102, 15, 92, 255, 255, 255, 255, 255, 213, 83, 24, 72, 236, 255, 255, 255, 255, 150, 76, 33, 63, 214, 255, 255, 255, 190, 121, 77, 43, 55, 185, 255, 255, 255, 245, 137, 71, 43, 59, 139, 255, 255, 255, 255, 131, 66, 50, 66, 107, 194, 255, 255, 166, 116, 76, 55, 53, 125, 255, 255, 100, 0, 3, 0, 40, 0, 3, 0, 3, 0, 3, 0, 5, 0, 14, 0, 14, 0, 10, 0, 11, 0, 3, 0, 8, 0, 9, 0, 7, 0, 3, 0, 91, 1, 0, 0, 0, 0, 0, 0, 32, 0, 16, 0, 102, 38, 171, 1, 8, 92, 0, 0, 8, 94, 0, 0, 72, 94, 0, 0, 104, 94, 0, 0, 104, 95, 0, 0, 176, 95, 0, 0, 248, 95, 0, 0, 0, 0, 0, 0, 224, 112, 44, 15, 3, 2, 1, 0, 254, 237, 192, 132, 70, 23, 4, 0, 255, 252, 226, 155, 61, 11, 2, 0, 250, 245, 234, 203, 71, 50, 42, 38, 35, 33, 31, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 31, 0, 0, 184, 36, 0, 0, 236, 44, 0, 0, 188, 52, 0, 0, 92, 68, 0, 0, 168, 97, 0, 0, 128, 56, 1, 0, 0, 0, 0, 0, 40, 35, 0, 0, 224, 46, 0, 0, 164, 56, 0, 0, 68, 72, 0, 0, 180, 95, 0, 0, 172, 138, 0, 0, 128, 56, 1, 0, 0, 0, 0, 0, 4, 41, 0, 0, 176, 54, 0, 0, 104, 66, 0, 0, 252, 83, 0, 0, 84, 111, 0, 0, 16, 164, 0, 0, 128, 56, 1, 0, 18, 0, 29, 0, 38, 0, 40, 0, 46, 0, 52, 0, 62, 0, 84, 0, 92, 202, 190, 216, 182, 223, 154, 226, 156, 230, 120, 236, 122, 244, 204, 252, 52, 3, 134, 11, 136, 19, 100, 25, 102, 29, 74, 32, 66, 39, 164, 53, 249, 247, 246, 245, 244, 234, 210, 202, 201, 200, 197, 174, 82, 59, 56, 55, 54, 46, 22, 12, 11, 10, 9, 7, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 203, 150, 0, 0, 0, 0, 0, 0, 215, 195, 166, 125, 110, 82, 0, 0, 72, 97, 0, 0, 80, 97, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 128, 64, 0, 0, 0, 0, 0, 0, 232, 158, 10, 0, 0, 0, 0, 0, 230, 0, 0, 0, 0, 0, 0, 0, 243, 221, 192, 181, 0, 0, 0, 0, 100, 0, 240, 0, 32, 0, 100, 0, 205, 60, 0, 48, 0, 32, 0, 0, 171, 85, 0, 0, 0, 0, 0, 0, 192, 128, 64, 0, 0, 0, 0, 0, 205, 154, 102, 51, 0, 0, 0, 0, 213, 171, 128, 85, 43, 0, 0, 0, 224, 192, 160, 128, 96, 64, 32, 0, 100, 40, 16, 7, 3, 1, 0, 0, 10, 103, 242, 14, 86, 205, 228, 29, 10, 103, 242, 14, 117, 82, 130, 12, 89, 154, 4, 25, 117, 82, 130, 12, 70, 17, 49, 10, 237, 3, 98, 20, 70, 17, 49, 10, 218, 2, 215, 7, 249, 198, 173, 15, 218, 2, 215, 7, 34, 182, 82, 5, 218, 250, 164, 10, 34, 182, 82, 5, 0, 0, 0, 0, 70, 243, 46, 30, 43, 227, 75, 14, 31, 102, 128, 24, 28, 44, 29, 10, 218, 97, 72, 18, 237, 156, 244, 6, 236, 48, 19, 11, 227, 144, 165, 4, 237, 164, 29, 2, 10, 223, 107, 3, 253, 250, 244, 233, 212, 182, 150, 131, 120, 110, 98, 85, 72, 60, 49, 40, 32, 25, 19, 15, 13, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 210, 208, 206, 203, 199, 193, 183, 168, 142, 104, 74, 52, 37, 27, 20, 14, 10, 6, 4, 2, 0, 0, 0, 0, 223, 201, 183, 167, 152, 138, 124, 111, 98, 88, 79, 70, 62, 56, 50, 44, 39, 35, 31, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 188, 176, 155, 138, 119, 97, 67, 43, 26, 10, 0, 0, 0, 0, 0, 0, 165, 119, 80, 61, 47, 35, 27, 20, 14, 9, 4, 0, 0, 0, 0, 0, 113, 63, 0, 0, 0, 0, 0, 0, 125, 51, 26, 18, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 198, 105, 45, 22, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 213, 162, 116, 83, 59, 43, 32, 24, 18, 15, 12, 9, 7, 6, 5, 3, 2, 0, 239, 187, 116, 59, 28, 16, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 250, 229, 188, 135, 86, 51, 30, 19, 13, 10, 8, 6, 5, 4, 3, 2, 1, 0, 249, 235, 213, 185, 156, 128, 103, 83, 66, 53, 42, 33, 26, 21, 17, 13, 10, 0, 254, 249, 235, 206, 164, 118, 77, 46, 27, 16, 10, 7, 5, 4, 3, 2, 1, 0, 255, 253, 249, 239, 220, 191, 156, 119, 85, 57, 37, 23, 15, 10, 6, 4, 2, 0, 255, 253, 251, 246, 237, 223, 203, 179, 152, 124, 98, 75, 55, 40, 29, 21, 15, 0, 255, 254, 253, 247, 220, 162, 106, 67, 42, 28, 18, 12, 9, 6, 4, 3, 2, 0, 0, 0, 0, 0, 31, 57, 107, 160, 205, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 69, 47, 67, 111, 166, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 82, 74, 79, 95, 109, 128, 145, 160, 173, 205, 205, 205, 224, 255, 255, 224, 255, 224, 125, 74, 59, 69, 97, 141, 182, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 173, 115, 85, 73, 76, 92, 115, 145, 173, 205, 224, 224, 255, 255, 255, 255, 255, 255, 166, 134, 113, 102, 101, 102, 107, 118, 125, 138, 145, 155, 166, 182, 192, 192, 205, 150, 224, 182, 134, 101, 83, 79, 85, 97, 120, 145, 173, 205, 224, 255, 255, 255, 255, 255, 255, 224, 192, 150, 120, 101, 92, 89, 93, 102, 118, 134, 160, 182, 192, 224, 224, 224, 255, 224, 224, 182, 155, 134, 118, 109, 104, 102, 106, 111, 118, 131, 145, 160, 173, 131, 0, 0, 0, 0, 0, 0, 241, 190, 178, 132, 87, 74, 41, 14, 0, 223, 193, 157, 140, 106, 57, 39, 18, 0, 0, 0, 0, 0, 0, 0, 131, 74, 141, 79, 80, 138, 95, 104, 134, 95, 99, 91, 125, 93, 76, 123, 115, 123, 0, 0, 0, 0, 0, 0, 128, 0, 214, 42, 0, 235, 128, 21, 0, 244, 184, 72, 11, 0, 248, 214, 128, 42, 7, 0, 248, 225, 170, 80, 25, 5, 0, 251, 236, 198, 126, 54, 18, 3, 0, 250, 238, 211, 159, 82, 35, 15, 5, 0, 250, 231, 203, 168, 128, 88, 53, 25, 6, 0, 252, 238, 216, 185, 148, 108, 71, 40, 18, 4, 0, 253, 243, 225, 199, 166, 128, 90, 57, 31, 13, 3, 0, 254, 246, 233, 212, 183, 147, 109, 73, 44, 23, 10, 2, 0, 255, 250, 240, 223, 198, 166, 128, 90, 58, 33, 16, 6, 1, 0, 255, 251, 244, 231, 210, 181, 146, 110, 75, 46, 25, 12, 5, 1, 0, 255, 253, 248, 238, 221, 196, 164, 128, 92, 60, 35, 18, 8, 3, 1, 0, 255, 253, 249, 242, 229, 208, 180, 146, 110, 76, 48, 27, 14, 7, 3, 1, 0, 129, 0, 207, 50, 0, 236, 129, 20, 0, 245, 185, 72, 10, 0, 249, 213, 129, 42, 6, 0, 250, 226, 169, 87, 27, 4, 0, 251, 233, 194, 130, 62, 20, 4, 0, 250, 236, 207, 160, 99, 47, 17, 3, 0, 255, 240, 217, 182, 131, 81, 41, 11, 1, 0, 255, 254, 233, 201, 159, 107, 61, 20, 2, 1, 0, 255, 249, 233, 206, 170, 128, 86, 50, 23, 7, 1, 0, 255, 250, 238, 217, 186, 148, 108, 70, 39, 18, 6, 1, 0, 255, 252, 243, 226, 200, 166, 128, 90, 56, 30, 13, 4, 1, 0, 255, 252, 245, 231, 209, 180, 146, 110, 76, 47, 25, 11, 4, 1, 0, 255, 253, 248, 237, 219, 194, 163, 128, 93, 62, 37, 19, 8, 3, 1, 0, 255, 254, 250, 241, 226, 205, 177, 145, 111, 79, 51, 30, 15, 6, 2, 1, 0, 129, 0, 203, 54, 0, 234, 129, 23, 0, 245, 184, 73, 10, 0, 250, 215, 129, 41, 5, 0, 252, 232, 173, 86, 24, 3, 0, 253, 240, 200, 129, 56, 15, 2, 0, 253, 244, 217, 164, 94, 38, 10, 1, 0, 253, 245, 226, 189, 132, 71, 27, 7, 1, 0, 253, 246, 231, 203, 159, 105, 56, 23, 6, 1, 0, 255, 248, 235, 213, 179, 133, 85, 47, 19, 5, 1, 0, 255, 254, 243, 221, 194, 159, 117, 70, 37, 12, 2, 1, 0, 255, 254, 248, 234, 208, 171, 128, 85, 48, 22, 8, 2, 1, 0, 255, 254, 250, 240, 220, 189, 149, 107, 67, 36, 16, 6, 2, 1, 0, 255, 254, 251, 243, 227, 201, 166, 128, 90, 55, 29, 13, 5, 2, 1, 0, 255, 254, 252, 246, 234, 213, 183, 147, 109, 73, 43, 22, 10, 4, 2, 1, 0, 130, 0, 200, 58, 0, 231, 130, 26, 0, 244, 184, 76, 12, 0, 249, 214, 130, 43, 6, 0, 252, 232, 173, 87, 24, 3, 0, 253, 241, 203, 131, 56, 14, 2, 0, 254, 246, 221, 167, 94, 35, 8, 1, 0, 254, 249, 232, 193, 130, 65, 23, 5, 1, 0, 255, 251, 239, 211, 162, 99, 45, 15, 4, 1, 0, 255, 251, 243, 223, 186, 131, 74, 33, 11, 3, 1, 0, 255, 252, 245, 230, 202, 158, 105, 57, 24, 8, 2, 1, 0, 255, 253, 247, 235, 214, 179, 132, 84, 44, 19, 7, 2, 1, 0, 255, 254, 250, 240, 223, 196, 159, 112, 69, 36, 15, 6, 2, 1, 0, 255, 254, 253, 245, 231, 209, 176, 136, 93, 55, 27, 11, 3, 2, 1, 0, 255, 254, 253, 252, 239, 221, 194, 158, 117, 76, 42, 18, 4, 3, 2, 1, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104, 119, 135, 0, 0, 0, 0, 0, 0, 0, 254, 49, 67, 77, 82, 93, 99, 198, 11, 18, 24, 31, 36, 45, 255, 46, 66, 78, 87, 94, 104, 208, 14, 21, 32, 42, 51, 66, 255, 94, 104, 109, 112, 115, 118, 248, 53, 69, 80, 88, 95, 102, 0, 0, 0, 0, 0, 0, 230, 90, 52, 56, 119, 78, 51, 57, 211, 217, 201, 57, 146, 145, 51, 58, 204, 96, 140, 58, 97, 251, 201, 58, 153, 126, 9, 59, 203, 128, 51, 59, 213, 37, 99, 59, 119, 46, 140, 59, 168, 138, 169, 59, 69, 184, 201, 59, 135, 166, 236, 59, 232, 46, 9, 60, 174, 102, 29, 60, 247, 2, 51, 60, 147, 255, 73, 60, 79, 88, 98, 60, 94, 17, 124, 60, 46, 145, 139, 60, 189, 199, 153, 60, 92, 172, 168, 60, 243, 60, 184, 60, 129, 121, 200, 60, 238, 95, 217, 60, 57, 240, 234, 60, 99, 42, 253, 60, 53, 7, 8, 61, 16, 204, 17, 61, 205, 228, 27, 61, 97, 80, 38, 61, 203, 14, 49, 61, 0, 31, 60, 61, 254, 128, 71, 61, 198, 52, 83, 61, 63, 56, 95, 61, 105, 139, 107, 61, 69, 46, 120, 61, 105, 144, 130, 61, 123, 48, 137, 61, 224, 247, 143, 61, 138, 229, 150, 61, 123, 249, 157, 61, 177, 51, 165, 61, 33, 147, 172, 61, 80, 24, 180, 61, 51, 194, 187, 61, 79, 145, 195, 61, 18, 132, 203, 61, 2, 155, 211, 61, 31, 214, 219, 61, 215, 51, 228, 61, 175, 180, 236, 61, 33, 88, 245, 61, 168, 29, 254, 61, 161, 130, 3, 62, 242, 6, 8, 62, 199, 155, 12, 62, 221, 64, 17, 62, 52, 246, 21, 62, 69, 187, 26, 62, 17, 144, 31, 62, 84, 116, 36, 62, 203, 103, 41, 62, 51, 106, 46, 62, 141, 123, 51, 62, 82, 155, 56, 62, 197, 201, 61, 62, 28, 6, 67, 62, 89, 80, 72, 62, 122, 168, 77, 62, 183, 13, 83, 62, 82, 128, 88, 62, 8, 0, 94, 62, 84, 140, 99, 62, 242, 36, 105, 62, 37, 202, 110, 62, 36, 123, 116, 62, 172, 55, 122, 62, 0, 0, 128, 62, 171, 233, 130, 62, 249, 216, 133, 62, 133, 205, 136, 62, 80, 199, 139, 62, 55, 198, 142, 62, 247, 201, 145, 62, 179, 210, 148, 62, 38, 224, 151, 62, 15, 242, 154, 62, 108, 8, 158, 62, 28, 35, 161, 62, 255, 65, 164, 62, 208, 100, 167, 62, 177, 139, 170, 62, 28, 182, 173, 62, 84, 228, 176, 62, 211, 21, 180, 62, 186, 74, 183, 62, 232, 130, 186, 62, 249, 189, 189, 62, 13, 252, 192, 62, 226, 60, 196, 62, 86, 128, 199, 62, 71, 198, 202, 62, 149, 14, 206, 62, 251, 88, 209, 62, 122, 165, 212, 62, 241, 243, 215, 62, 28, 68, 219, 62, 217, 149, 222, 62, 8, 233, 225, 62, 167, 61, 229, 62, 83, 147, 232, 62, 12, 234, 235, 62, 175, 65, 239, 62, 28, 154, 242, 62, 14, 243, 245, 62, 136, 76, 249, 62, 34, 166, 252, 62, 0, 0, 0, 63, 239, 172, 1, 63, 188, 89, 3, 63, 121, 6, 5, 63, 242, 178, 6, 63, 41, 95, 8, 63, 250, 10, 10, 63, 86, 182, 11, 63, 44, 97, 13, 63, 124, 11, 15, 63, 19, 181, 16, 63, 242, 93, 18, 63, 8, 6, 20, 63, 67, 173, 21, 63, 130, 83, 23, 63, 182, 248, 24, 63, 220, 156, 26, 63, 213, 63, 28, 63, 143, 225, 29, 63, 249, 129, 31, 63, 4, 33, 33, 63, 140, 190, 34, 63, 163, 90, 36, 63, 23, 245, 37, 63, 214, 141, 39, 63, 242, 36, 41, 63, 40, 186, 42, 63, 152, 77, 44, 63, 1, 223, 45, 63, 114, 110, 47, 63, 202, 251, 48, 63, 249, 134, 50, 63, 237, 15, 52, 63, 167, 150, 53, 63, 4, 27, 55, 63, 229, 156, 56, 63, 88, 28, 58, 63, 61, 153, 59, 63, 131, 19, 61, 63, 42, 139, 62, 63, 0, 0, 64, 63, 21, 114, 65, 63, 55, 225, 66, 63, 119, 77, 68, 63, 195, 182, 69, 63, 235, 28, 71, 63, 254, 127, 72, 63, 236, 223, 73, 63, 146, 60, 75, 63, 225, 149, 76, 63, 234, 235, 77, 63, 121, 62, 79, 63, 143, 141, 80, 63, 43, 217, 81, 63, 29, 33, 83, 63, 115, 101, 84, 63, 13, 166, 85, 63, 235, 226, 86, 63, 252, 27, 88, 63, 47, 81, 89, 63, 115, 130, 90, 63, 201, 175, 91, 63, 14, 217, 92, 63, 67, 254, 93, 63, 88, 31, 95, 63, 75, 60, 96, 63, 252, 84, 97, 63, 106, 105, 98, 63, 133, 121, 99, 63, 60, 133, 100, 63, 160, 140, 101, 63, 126, 143, 102, 63, 214, 141, 103, 63, 186, 135, 104, 63, 246, 124, 105, 63, 156, 109, 106, 63, 138, 89, 107, 63, 209, 64, 108, 63, 79, 35, 109, 63, 4, 1, 110, 63, 241, 217, 110, 63, 243, 173, 111, 63, 28, 125, 112, 63, 73, 71, 113, 63, 124, 12, 114, 63, 180, 204, 114, 63, 240, 135, 115, 63, 16, 62, 116, 63, 19, 239, 116, 63, 250, 154, 117, 63, 179, 65, 118, 63, 63, 227, 118, 63, 141, 127, 119, 63, 173, 22, 120, 63, 126, 168, 120, 63, 1, 53, 121, 63, 52, 188, 121, 63, 24, 62, 122, 63, 157, 186, 122, 63, 194, 49, 123, 63, 119, 163, 123, 63, 187, 15, 124, 63, 159, 118, 124, 63, 2, 216, 124, 63, 244, 51, 125, 63, 101, 138, 125, 63, 68, 219, 125, 63, 179, 38, 126, 63, 143, 108, 126, 63, 235, 172, 126, 63, 163, 231, 126, 63, 218, 28, 127, 63, 127, 76, 127, 63, 129, 118, 127, 63, 2, 155, 127, 63, 208, 185, 127, 63, 28, 211, 127, 63, 197, 230, 127, 63, 203, 244, 127, 63, 47, 253, 127, 63, 0, 0, 128, 63, 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0, 8, 0, 0, 0, 10, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 28, 0, 0, 0, 32, 0, 0, 0, 40, 0, 0, 0, 48, 0, 0, 0, 56, 0, 0, 0, 68, 0, 0, 0, 80, 0, 0, 0, 96, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0, 8, 0, 0, 0, 10, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 28, 0, 0, 0, 32, 0, 0, 0, 40, 0, 0, 0, 48, 0, 0, 0, 56, 0, 0, 0, 68, 0, 0, 0, 80, 0, 0, 0, 96, 0, 0, 0, 120, 0, 0, 0, 160, 0, 0, 0, 200, 0, 0, 0, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 208, 37, 180, 62, 151, 57, 173, 62, 9, 165, 159, 62, 250, 237, 139, 62, 205, 172, 101, 62, 248, 169, 42, 62, 52, 48, 210, 61, 90, 241, 13, 61, 90, 241, 13, 189, 52, 48, 210, 189, 248, 169, 42, 190, 205, 172, 101, 190, 250, 237, 139, 190, 9, 165, 159, 190, 151, 57, 173, 190, 208, 37, 180, 190, 135, 138, 177, 62, 27, 131, 150, 62, 96, 35, 73, 62, 196, 66, 141, 61, 196, 66, 141, 189, 96, 35, 73, 190, 27, 131, 150, 190, 135, 138, 177, 190, 135, 138, 177, 190, 27, 131, 150, 190, 96, 35, 73, 190, 196, 66, 141, 189, 196, 66, 141, 61, 96, 35, 73, 62, 27, 131, 150, 62, 135, 138, 177, 62, 151, 57, 173, 62, 205, 172, 101, 62, 90, 241, 13, 61, 248, 169, 42, 190, 9, 165, 159, 190, 208, 37, 180, 190, 250, 237, 139, 190, 52, 48, 210, 189, 52, 48, 210, 61, 250, 237, 139, 62, 208, 37, 180, 62, 9, 165, 159, 62, 248, 169, 42, 62, 90, 241, 13, 189, 205, 172, 101, 190, 151, 57, 173, 190, 125, 61, 167, 62, 210, 139, 10, 62, 210, 139, 10, 190, 125, 61, 167, 190, 125, 61, 167, 190, 210, 139, 10, 190, 210, 139, 10, 62, 125, 61, 167, 62, 125, 61, 167, 62, 210, 139, 10, 62, 210, 139, 10, 190, 125, 61, 167, 190, 125, 61, 167, 190, 210, 139, 10, 190, 210, 139, 10, 62, 125, 61, 167, 62, 9, 165, 159, 62, 90, 241, 13, 61, 250, 237, 139, 190, 151, 57, 173, 190, 52, 48, 210, 189, 205, 172, 101, 62, 208, 37, 180, 62, 248, 169, 42, 62, 248, 169, 42, 190, 208, 37, 180, 190, 205, 172, 101, 190, 52, 48, 210, 61, 151, 57, 173, 62, 250, 237, 139, 62, 90, 241, 13, 189, 9, 165, 159, 190, 27, 131, 150, 62, 196, 66, 141, 189, 135, 138, 177, 190, 96, 35, 73, 190, 96, 35, 73, 62, 135, 138, 177, 62, 196, 66, 141, 61, 27, 131, 150, 190, 27, 131, 150, 190, 196, 66, 141, 61, 135, 138, 177, 62, 96, 35, 73, 62, 96, 35, 73, 190, 135, 138, 177, 190, 196, 66, 141, 189, 27, 131, 150, 62, 250, 237, 139, 62, 248, 169, 42, 190, 151, 57, 173, 190, 90, 241, 13, 61, 208, 37, 180, 62, 52, 48, 210, 61, 9, 165, 159, 190, 205, 172, 101, 190, 205, 172, 101, 62, 9, 165, 159, 62, 52, 48, 210, 189, 208, 37, 180, 190, 90, 241, 13, 189, 151, 57, 173, 62, 248, 169, 42, 62, 250, 237, 139, 190, 0, 0, 0, 0, 5, 193, 35, 61, 233, 125, 163, 61, 37, 150, 244, 61, 226, 116, 34, 62, 172, 28, 74, 62, 221, 37, 113, 62, 52, 186, 139, 62, 180, 119, 158, 62, 228, 191, 176, 62, 173, 136, 194, 62, 37, 201, 211, 62, 24, 122, 228, 62, 24, 149, 244, 62, 200, 10, 2, 63, 28, 124, 9, 63, 73, 157, 16, 63, 202, 109, 23, 63, 192, 237, 29, 63, 159, 29, 36, 63, 84, 254, 41, 63, 46, 145, 47, 63, 224, 215, 52, 63, 99, 212, 57, 63, 240, 136, 62, 63, 211, 247, 66, 63, 171, 35, 71, 63, 23, 15, 75, 63, 216, 188, 78, 63, 173, 47, 82, 63, 106, 106, 85, 63, 206, 111, 88, 63, 154, 66, 91, 63, 142, 229, 93, 63, 75, 91, 96, 63, 110, 166, 98, 63, 100, 201, 100, 63, 155, 198, 102, 63, 111, 160, 104, 63, 247, 88, 106, 63, 128, 242, 107, 63, 223, 110, 109, 63, 11, 208, 110, 63, 202, 23, 112, 63, 224, 71, 113, 63, 225, 97, 114, 63, 77, 103, 115, 63, 150, 89, 116, 63, 12, 58, 117, 63, 255, 9, 118, 63, 138, 202, 118, 63, 187, 124, 119, 63, 192, 33, 120, 63, 98, 186, 120, 63, 157, 71, 121, 63, 75, 202, 121, 63, 36, 67, 122, 63, 242, 178, 122, 63, 59, 26, 123, 63, 200, 121, 123, 63, 32, 210, 123, 63, 200, 35, 124, 63, 55, 111, 124, 63, 242, 180, 124, 63, 94, 245, 124, 63, 224, 48, 125, 63, 236, 103, 125, 63, 183, 154, 125, 63, 180, 201, 125, 63, 6, 245, 125, 63, 17, 29, 126, 63, 24, 66, 126, 63, 78, 100, 126, 63, 211, 131, 126, 63, 253, 160, 126, 63, 237, 187, 126, 63, 195, 212, 126, 63, 179, 235, 126, 63, 239, 0, 127, 63, 135, 20, 127, 63, 141, 38, 127, 63, 67, 55, 127, 63, 170, 70, 127, 63, 227, 84, 127, 63, 15, 98, 127, 63, 47, 110, 127, 63, 100, 121, 127, 63, 190, 131, 127, 63, 63, 141, 127, 63, 24, 150, 127, 63, 56, 158, 127, 63, 194, 165, 127, 63, 163, 172, 127, 63, 16, 179, 127, 63, 245, 184, 127, 63, 119, 190, 127, 63, 114, 195, 127, 63, 25, 200, 127, 63, 108, 204, 127, 63, 91, 208, 127, 63, 6, 212, 127, 63, 111, 215, 127, 63, 131, 218, 127, 63, 102, 221, 127, 63, 21, 224, 127, 63, 130, 226, 127, 63, 205, 228, 127, 63, 230, 230, 127, 63, 205, 232, 127, 63, 146, 234, 127, 63, 70, 236, 127, 63, 200, 237, 127, 63, 40, 239, 127, 63, 120, 240, 127, 63, 166, 241, 127, 63, 195, 242, 127, 63, 191, 243, 127, 63, 186, 244, 127, 63, 148, 245, 127, 63, 94, 246, 127, 63, 39, 247, 127, 63, 207, 247, 127, 63, 119, 248, 127, 63, 253, 248, 127, 63, 148, 249, 127, 63, 9, 250, 127, 63, 127, 250, 127, 63, 244, 250, 127, 63, 89, 251, 127, 63, 173, 251, 127, 63, 1, 252, 127, 63, 84, 252, 127, 63, 152, 252, 127, 63, 219, 252, 127, 63, 30, 253, 127, 63, 80, 253, 127, 63, 130, 253, 127, 63, 181, 253, 127, 63, 231, 253, 127, 63, 9, 254, 127, 63, 59, 254, 127, 63, 93, 254, 127, 63, 126, 254, 127, 63, 143, 254, 127, 63, 176, 254, 127, 63, 210, 254, 127, 63, 227, 254, 127, 63, 244, 254, 127, 63, 21, 255, 127, 63, 38, 255, 127, 63, 55, 255, 127, 63, 71, 255, 127, 63, 88, 255, 127, 63, 88, 255, 127, 63, 105, 255, 127, 63, 122, 255, 127, 63, 122, 255, 127, 63, 139, 255, 127, 63, 155, 255, 127, 63, 155, 255, 127, 63, 155, 255, 127, 63, 172, 255, 127, 63, 172, 255, 127, 63, 189, 255, 127, 63, 189, 255, 127, 63, 189, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 0, 0, 14, 190, 192, 189, 172, 31, 155, 190, 149, 130, 26, 191, 150, 149, 70, 190, 84, 114, 62, 190, 146, 3, 26, 191, 6, 152, 62, 189, 2, 160, 234, 189, 182, 43, 212, 189, 185, 114, 30, 191, 106, 190, 162, 190, 28, 7, 46, 190, 107, 243, 143, 189, 90, 158, 23, 62, 33, 173, 209, 62, 10, 102, 12, 63, 125, 60, 188, 62, 20, 33, 253, 190, 143, 169, 67, 63, 8, 119, 235, 191, 10, 243, 46, 62, 117, 147, 76, 65, 80, 83, 139, 191, 108, 236, 162, 191, 181, 21, 130, 193, 28, 107, 193, 65, 162, 98, 178, 192, 255, 231, 48, 190, 47, 79, 39, 190, 158, 206, 101, 190, 255, 87, 194, 189, 155, 60, 149, 189, 203, 248, 135, 190, 44, 97, 205, 189, 203, 33, 83, 189, 64, 166, 21, 190, 238, 35, 247, 189, 160, 253, 56, 190, 219, 167, 3, 62, 233, 95, 226, 62, 213, 202, 252, 190, 29, 203, 43, 62, 231, 168, 83, 62, 1, 79, 74, 190, 247, 3, 214, 62, 71, 119, 192, 63, 173, 249, 69, 191, 64, 164, 32, 193, 43, 194, 205, 62, 192, 178, 62, 64, 201, 118, 115, 65, 100, 204, 241, 191, 39, 165, 152, 191, 23, 204, 233, 60, 134, 193, 132, 187, 201, 232, 144, 61, 84, 72, 7, 60, 154, 231, 189, 189, 103, 71, 42, 188, 59, 137, 140, 187, 159, 122, 160, 187, 88, 90, 145, 189, 85, 196, 39, 187, 169, 11, 34, 61, 177, 219, 103, 62, 241, 54, 5, 61, 52, 17, 38, 62, 170, 10, 205, 189, 86, 185, 248, 62, 108, 4, 2, 62, 86, 102, 146, 62, 228, 254, 126, 60, 106, 251, 215, 61, 159, 142, 67, 64, 136, 70, 147, 63, 57, 40, 129, 191, 71, 90, 234, 191, 139, 84, 84, 64, 210, 53, 91, 192, 13, 253, 243, 189, 232, 39, 38, 189, 25, 31, 226, 59, 241, 90, 147, 60, 171, 170, 28, 189, 237, 238, 195, 59, 5, 106, 150, 188, 246, 141, 249, 58, 37, 201, 19, 190, 106, 115, 50, 189, 210, 214, 129, 58, 161, 100, 98, 62, 158, 210, 17, 62, 128, 215, 247, 62, 221, 12, 207, 62, 124, 15, 3, 63, 250, 242, 114, 190, 55, 139, 119, 62, 47, 110, 179, 62, 183, 13, 51, 191, 136, 99, 38, 65, 18, 165, 41, 64, 83, 208, 27, 192, 53, 7, 134, 192, 125, 150, 135, 63, 60, 247, 218, 63, 12, 212, 218, 59, 186, 186, 147, 189, 191, 192, 34, 189, 69, 144, 20, 61, 38, 112, 235, 189, 208, 37, 193, 188, 210, 156, 6, 60, 124, 58, 104, 188, 114, 11, 7, 189, 31, 26, 17, 189, 171, 204, 53, 59, 154, 208, 148, 190, 218, 230, 146, 191, 140, 104, 163, 190, 89, 193, 47, 191, 163, 233, 188, 62, 64, 50, 245, 62, 253, 245, 58, 62, 163, 119, 210, 190, 8, 144, 97, 63, 39, 107, 147, 192, 33, 31, 188, 63, 224, 243, 171, 62, 161, 214, 232, 191, 245, 91, 241, 193, 8, 172, 177, 64, 252, 177, 255, 58, 106, 21, 253, 189, 37, 245, 148, 189, 41, 102, 131, 189, 252, 233, 90, 189, 35, 134, 221, 189, 20, 249, 191, 189, 43, 237, 142, 189, 75, 171, 225, 188, 167, 236, 68, 190, 122, 110, 225, 189, 172, 28, 146, 62, 105, 170, 207, 190, 7, 203, 189, 61, 35, 101, 147, 190, 201, 231, 89, 191, 252, 194, 203, 189, 212, 95, 111, 190, 111, 129, 164, 191, 13, 108, 145, 63, 155, 201, 71, 64, 187, 39, 143, 189, 66, 91, 238, 191, 113, 201, 41, 64, 120, 238, 233, 192, 26, 168, 28, 64, 135, 138, 146, 186, 54, 152, 129, 189, 127, 33, 26, 189, 138, 114, 25, 190, 229, 100, 18, 62, 247, 202, 60, 62, 113, 202, 252, 61, 117, 220, 154, 61, 70, 65, 240, 61, 200, 40, 191, 61, 71, 193, 141, 61, 22, 144, 172, 61, 175, 81, 144, 61, 27, 166, 113, 61, 173, 246, 192, 61, 61, 209, 229, 190, 92, 47, 215, 60, 148, 107, 138, 62, 106, 78, 134, 190, 98, 186, 48, 62, 49, 37, 0, 64, 133, 9, 35, 190, 99, 96, 29, 61, 26, 81, 35, 65, 182, 248, 132, 64, 7, 206, 21, 192, 120, 99, 97, 189, 79, 18, 30, 60, 98, 186, 16, 190, 8, 223, 224, 60, 187, 222, 12, 61, 136, 166, 71, 189, 97, 152, 194, 61, 35, 245, 253, 187, 158, 146, 24, 189, 185, 155, 179, 187, 187, 236, 135, 189, 45, 182, 196, 61, 230, 206, 76, 190, 12, 24, 41, 189, 251, 87, 22, 63, 48, 68, 83, 61, 142, 172, 172, 62, 218, 226, 90, 63, 93, 26, 43, 63, 202, 82, 235, 189, 178, 75, 104, 192, 37, 89, 239, 190, 177, 164, 92, 190, 57, 98, 39, 64, 145, 238, 207, 62, 180, 142, 174, 191, 203, 61, 46, 61, 20, 5, 250, 61, 210, 98, 191, 61, 67, 4, 252, 61, 160, 165, 11, 61, 155, 226, 17, 190, 245, 130, 15, 61, 15, 250, 72, 189, 55, 41, 150, 61, 113, 52, 108, 61, 83, 235, 253, 61, 185, 215, 83, 189, 147, 139, 129, 190, 69, 47, 23, 63, 113, 89, 21, 62, 238, 95, 161, 62, 207, 217, 98, 62, 177, 168, 24, 190, 79, 89, 93, 62, 127, 251, 178, 190, 253, 135, 196, 65, 161, 131, 126, 191, 11, 66, 29, 63, 242, 82, 150, 193, 27, 76, 53, 192, 69, 128, 55, 191, 84, 196, 177, 190, 253, 130, 245, 62, 128, 238, 123, 190, 215, 96, 155, 61, 137, 150, 12, 62, 211, 19, 54, 190, 185, 51, 243, 61, 46, 253, 141, 186, 175, 7, 115, 190, 129, 34, 182, 62, 33, 7, 5, 190, 218, 78, 96, 189, 101, 28, 163, 190, 21, 171, 166, 190, 107, 211, 56, 62, 171, 31, 128, 189, 183, 155, 16, 62, 40, 41, 176, 62, 24, 207, 192, 62, 95, 126, 23, 191, 102, 247, 186, 64, 170, 241, 194, 190, 46, 56, 99, 62, 239, 172, 181, 191, 48, 108, 229, 201, 122, 170, 171, 63, 218, 31, 232, 60, 27, 113, 55, 189, 162, 59, 173, 188, 127, 121, 210, 188, 9, 192, 100, 60, 236, 86, 170, 60, 101, 102, 48, 188, 198, 207, 53, 60, 202, 13, 112, 61, 62, 180, 207, 188, 178, 134, 6, 189, 121, 35, 243, 61, 78, 38, 94, 190, 247, 62, 21, 62, 230, 93, 245, 61, 106, 111, 187, 189, 198, 21, 247, 189, 41, 83, 161, 189, 106, 23, 19, 190, 134, 89, 24, 191, 188, 116, 147, 191, 198, 109, 160, 191, 181, 224, 149, 191, 42, 227, 138, 64, 64, 26, 110, 201, 249, 102, 175, 191, 204, 76, 36, 189, 13, 168, 87, 62, 141, 239, 11, 190, 159, 57, 11, 62, 64, 87, 86, 189, 28, 28, 54, 61, 199, 207, 107, 60, 239, 56, 135, 59, 170, 27, 158, 188, 226, 177, 95, 62, 162, 178, 225, 189, 236, 163, 1, 192, 165, 17, 107, 63, 28, 8, 29, 192, 134, 3, 153, 63, 184, 86, 123, 189, 48, 18, 246, 191, 186, 192, 157, 62, 172, 202, 254, 62, 42, 144, 105, 63, 102, 75, 86, 62, 147, 24, 22, 192, 95, 94, 12, 64, 39, 20, 207, 192, 144, 78, 217, 63, 169, 161, 57, 191, 112, 218, 66, 60, 77, 206, 26, 61, 109, 235, 98, 61, 109, 130, 185, 60, 243, 67, 144, 189, 93, 3, 246, 188, 182, 124, 73, 60, 72, 233, 136, 187, 62, 158, 140, 189, 125, 64, 0, 61, 219, 50, 32, 61, 194, 108, 186, 62, 242, 165, 193, 189, 126, 80, 188, 60, 194, 81, 50, 190, 228, 218, 168, 62, 44, 239, 234, 61, 112, 182, 153, 62, 62, 33, 219, 61, 18, 136, 7, 62, 8, 148, 185, 64, 125, 118, 104, 63, 80, 195, 103, 191, 88, 202, 86, 192, 248, 56, 67, 62, 207, 161, 60, 62, 50, 116, 44, 191, 208, 94, 109, 62, 213, 29, 112, 189, 65, 74, 108, 62, 216, 101, 224, 190, 240, 193, 123, 62, 23, 72, 48, 190, 182, 123, 179, 61, 121, 115, 56, 191, 85, 106, 38, 62, 85, 187, 139, 60, 143, 114, 208, 61, 117, 230, 198, 62, 213, 38, 170, 63, 2, 241, 138, 63, 108, 177, 111, 191, 51, 167, 23, 192, 66, 9, 215, 192, 144, 102, 92, 192, 241, 215, 8, 64, 116, 181, 99, 65, 82, 68, 157, 64, 20, 203, 69, 192, 16, 18, 27, 193, 252, 170, 68, 191, 164, 228, 229, 63, 75, 35, 97, 61, 17, 82, 39, 62, 16, 59, 163, 61, 253, 223, 12, 61, 211, 175, 99, 189, 237, 178, 165, 187, 217, 102, 153, 60, 110, 201, 5, 61, 34, 162, 189, 60, 175, 119, 31, 62, 154, 15, 67, 61, 75, 120, 130, 190, 151, 255, 204, 63, 210, 28, 77, 191, 119, 132, 35, 64, 65, 213, 60, 63, 19, 102, 174, 191, 221, 9, 50, 191, 71, 90, 28, 192, 62, 174, 221, 191, 131, 250, 124, 64, 205, 1, 242, 63, 101, 224, 248, 62, 75, 89, 53, 193, 128, 147, 112, 74, 249, 75, 195, 190, 126, 29, 248, 61, 94, 44, 104, 191, 249, 20, 60, 64, 51, 196, 209, 63, 231, 255, 97, 63, 2, 213, 95, 63, 45, 207, 155, 63, 46, 226, 95, 191, 166, 182, 164, 62, 93, 249, 72, 63, 160, 81, 114, 63, 134, 55, 19, 191, 62, 203, 93, 192, 34, 137, 98, 63, 173, 62, 189, 61, 144, 131, 30, 193, 116, 93, 200, 62, 10, 242, 35, 62, 170, 43, 3, 192, 240, 167, 132, 64, 210, 22, 140, 61, 58, 60, 20, 190, 123, 16, 146, 190, 69, 44, 194, 62, 116, 70, 148, 191, 167, 29, 227, 188, 154, 153, 29, 193, 16, 93, 154, 192, 51, 167, 109, 64, 139, 224, 119, 64, 26, 163, 97, 64, 248, 42, 0, 0, 232, 3, 0, 0, 176, 54, 0, 0, 232, 3, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 96, 109, 0, 0, 208, 7, 0, 0, 224, 46, 0, 0, 232, 3, 0, 0, 80, 70, 0, 0, 208, 7, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 48, 117, 0, 0, 208, 7, 0, 0, 248, 42, 0, 0, 232, 3, 0, 0, 176, 54, 0, 0, 232, 3, 0, 0, 104, 66, 0, 0, 232, 3, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 224, 46, 0, 0, 232, 3, 0, 0, 152, 58, 0, 0, 232, 3, 0, 0, 80, 70, 0, 0, 208, 7, 0, 0, 240, 85, 0, 0, 208, 7], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 20480);
var tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);
assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) {
	HEAP8[tempDoublePtr] = HEAP8[ptr];
	HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
	HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
	HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3]
}
function copyTempDouble(ptr) {
	HEAP8[tempDoublePtr] = HEAP8[ptr];
	HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
	HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
	HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
	HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
	HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
	HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
	HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7]
}
Module["_bitshift64Ashr"] = _bitshift64Ashr;
Module["_bitshift64Lshr"] = _bitshift64Lshr;
var _fabsf = Math_abs;
var ___errno_state = 0;

function ___setErrNo(value) {
	HEAP32[___errno_state >> 2] = value;
	return value
}
var ERRNO_CODES = {
	EPERM: 1,
	ENOENT: 2,
	ESRCH: 3,
	EINTR: 4,
	EIO: 5,
	ENXIO: 6,
	E2BIG: 7,
	ENOEXEC: 8,
	EBADF: 9,
	ECHILD: 10,
	EAGAIN: 11,
	EWOULDBLOCK: 11,
	ENOMEM: 12,
	EACCES: 13,
	EFAULT: 14,
	ENOTBLK: 15,
	EBUSY: 16,
	EEXIST: 17,
	EXDEV: 18,
	ENODEV: 19,
	ENOTDIR: 20,
	EISDIR: 21,
	EINVAL: 22,
	ENFILE: 23,
	EMFILE: 24,
	ENOTTY: 25,
	ETXTBSY: 26,
	EFBIG: 27,
	ENOSPC: 28,
	ESPIPE: 29,
	EROFS: 30,
	EMLINK: 31,
	EPIPE: 32,
	EDOM: 33,
	ERANGE: 34,
	ENOMSG: 42,
	EIDRM: 43,
	ECHRNG: 44,
	EL2NSYNC: 45,
	EL3HLT: 46,
	EL3RST: 47,
	ELNRNG: 48,
	EUNATCH: 49,
	ENOCSI: 50,
	EL2HLT: 51,
	EDEADLK: 35,
	ENOLCK: 37,
	EBADE: 52,
	EBADR: 53,
	EXFULL: 54,
	ENOANO: 55,
	EBADRQC: 56,
	EBADSLT: 57,
	EDEADLOCK: 35,
	EBFONT: 59,
	ENOSTR: 60,
	ENODATA: 61,
	ETIME: 62,
	ENOSR: 63,
	ENONET: 64,
	ENOPKG: 65,
	EREMOTE: 66,
	ENOLINK: 67,
	EADV: 68,
	ESRMNT: 69,
	ECOMM: 70,
	EPROTO: 71,
	EMULTIHOP: 72,
	EDOTDOT: 73,
	EBADMSG: 74,
	ENOTUNIQ: 76,
	EBADFD: 77,
	EREMCHG: 78,
	ELIBACC: 79,
	ELIBBAD: 80,
	ELIBSCN: 81,
	ELIBMAX: 82,
	ELIBEXEC: 83,
	ENOSYS: 38,
	ENOTEMPTY: 39,
	ENAMETOOLONG: 36,
	ELOOP: 40,
	EOPNOTSUPP: 95,
	EPFNOSUPPORT: 96,
	ECONNRESET: 104,
	ENOBUFS: 105,
	EAFNOSUPPORT: 97,
	EPROTOTYPE: 91,
	ENOTSOCK: 88,
	ENOPROTOOPT: 92,
	ESHUTDOWN: 108,
	ECONNREFUSED: 111,
	EADDRINUSE: 98,
	ECONNABORTED: 103,
	ENETUNREACH: 101,
	ENETDOWN: 100,
	ETIMEDOUT: 110,
	EHOSTDOWN: 112,
	EHOSTUNREACH: 113,
	EINPROGRESS: 115,
	EALREADY: 114,
	EDESTADDRREQ: 89,
	EMSGSIZE: 90,
	EPROTONOSUPPORT: 93,
	ESOCKTNOSUPPORT: 94,
	EADDRNOTAVAIL: 99,
	ENETRESET: 102,
	EISCONN: 106,
	ENOTCONN: 107,
	ETOOMANYREFS: 109,
	EUSERS: 87,
	EDQUOT: 122,
	ESTALE: 116,
	ENOTSUP: 95,
	ENOMEDIUM: 123,
	EILSEQ: 84,
	EOVERFLOW: 75,
	ECANCELED: 125,
	ENOTRECOVERABLE: 131,
	EOWNERDEAD: 130,
	ESTRPIPE: 86
};

function _sysconf(name) {
	switch (name) {
	case 30:
		return PAGE_SIZE;
	case 132:
	case 133:
	case 12:
	case 137:
	case 138:
	case 15:
	case 235:
	case 16:
	case 17:
	case 18:
	case 19:
	case 20:
	case 149:
	case 13:
	case 10:
	case 236:
	case 153:
	case 9:
	case 21:
	case 22:
	case 159:
	case 154:
	case 14:
	case 77:
	case 78:
	case 139:
	case 80:
	case 81:
	case 79:
	case 82:
	case 68:
	case 67:
	case 164:
	case 11:
	case 29:
	case 47:
	case 48:
	case 95:
	case 52:
	case 51:
	case 46:
		return 200809;
	case 27:
	case 246:
	case 127:
	case 128:
	case 23:
	case 24:
	case 160:
	case 161:
	case 181:
	case 182:
	case 242:
	case 183:
	case 184:
	case 243:
	case 244:
	case 245:
	case 165:
	case 178:
	case 179:
	case 49:
	case 50:
	case 168:
	case 169:
	case 175:
	case 170:
	case 171:
	case 172:
	case 97:
	case 76:
	case 32:
	case 173:
	case 35:
		return -1;
	case 176:
	case 177:
	case 7:
	case 155:
	case 8:
	case 157:
	case 125:
	case 126:
	case 92:
	case 93:
	case 129:
	case 130:
	case 131:
	case 94:
	case 91:
		return 1;
	case 74:
	case 60:
	case 69:
	case 70:
	case 4:
		return 1024;
	case 31:
	case 42:
	case 72:
		return 32;
	case 87:
	case 26:
	case 33:
		return 2147483647;
	case 34:
	case 1:
		return 47839;
	case 38:
	case 36:
		return 99;
	case 43:
	case 37:
		return 2048;
	case 0:
		return 2097152;
	case 3:
		return 65536;
	case 28:
		return 32768;
	case 44:
		return 32767;
	case 75:
		return 16384;
	case 39:
		return 1e3;
	case 89:
		return 700;
	case 71:
		return 256;
	case 40:
		return 255;
	case 2:
		return 100;
	case 180:
		return 64;
	case 25:
		return 20;
	case 5:
		return 16;
	case 6:
		return 6;
	case 73:
		return 4;
	case 84:
		{
			if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
			return 1
		}
	}
	___setErrNo(ERRNO_CODES.EINVAL);
	return -1
}
var ctlz_i8 = allocate([8, 7, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "i8", ALLOC_STATIC);
Module["_llvm_ctlz_i32"] = _llvm_ctlz_i32;
Module["_memset"] = _memset;

function _llvm_stackrestore(p) {
	var self = _llvm_stacksave;
	var ret = self.LLVM_SAVEDSTACKS[p];
	self.LLVM_SAVEDSTACKS.splice(p, 1);
	Runtime.stackRestore(ret)
}
var _floorf = Math_floor;

function _abort() {
	Module["abort"]()
}
var _sqrtf = Math_sqrt;
var _log = Math_log;
var _cos = Math_cos;
Module["_i64Add"] = _i64Add;

function _sbrk(bytes) {
	var self = _sbrk;
	if (!self.called) {
		DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
		self.called = true;
		assert(Runtime.dynamicAlloc);
		self.alloc = Runtime.dynamicAlloc;
		Runtime.dynamicAlloc = (function() {
			abort("cannot dynamically allocate, sbrk now has control")
		})
	}
	var ret = DYNAMICTOP;
	if (bytes != 0) self.alloc(bytes);
	return ret
}
var _floor = Math_floor;

function _exp2(x) {
	return Math.pow(2, x)
}
function _rint(x) {
	if (Math.abs(x % 1) !== .5) return Math.round(x);
	return x + x % 2 + (x < 0 ? 1 : -1)
}
function _lrintf() {
	return _rint.apply(null, arguments)
}
function ___errno_location() {
	return ___errno_state
}
var _sqrt = Math_sqrt;

function _emscripten_memcpy_big(dest, src, num) {
	HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
	return dest
}
Module["_memcpy"] = _memcpy;
var _atan2 = Math_atan2;

function _llvm_stacksave() {
	var self = _llvm_stacksave;
	if (!self.LLVM_SAVEDSTACKS) {
		self.LLVM_SAVEDSTACKS = []
	}
	self.LLVM_SAVEDSTACKS.push(Runtime.stackSave());
	return self.LLVM_SAVEDSTACKS.length - 1
}
function _time(ptr) {
	var ret = Date.now() / 1e3 | 0;
	if (ptr) {
		HEAP32[ptr >> 2] = ret
	}
	return ret
}
var _exp = Math_exp;
var _llvm_pow_f64 = Math_pow;
Module["_memmove"] = _memmove;

function _log10(x) {
	return Math.log(x) / Math.LN10
}
___errno_state = Runtime.staticAlloc(4);
HEAP32[___errno_state >> 2] = 0;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
staticSealed = true;
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");
var cttz_i8 = allocate([8, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 7, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0], "i8", ALLOC_DYNAMIC);

function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
	try {
		Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
	} catch (e) {
		if (typeof e !== "number" && e !== "longjmp") throw e;
		asm["setThrew"](1, 0)
	}
}
Module.asmGlobalArg = {
	"Math": Math,
	"Int8Array": Int8Array,
	"Int16Array": Int16Array,
	"Int32Array": Int32Array,
	"Uint8Array": Uint8Array,
	"Uint16Array": Uint16Array,
	"Uint32Array": Uint32Array,
	"Float32Array": Float32Array,
	"Float64Array": Float64Array
};
Module.asmLibraryArg = {
	"abort": abort,
	"assert": assert,
	"min": Math_min,
	"invoke_viiiiiii": invoke_viiiiiii,
	"_exp": _exp,
	"_llvm_pow_f64": _llvm_pow_f64,
	"_sqrtf": _sqrtf,
	"_atan2": _atan2,
	"___setErrNo": ___setErrNo,
	"_llvm_stackrestore": _llvm_stackrestore,
	"_floor": _floor,
	"_log10": _log10,
	"_fabsf": _fabsf,
	"_sbrk": _sbrk,
	"_emscripten_memcpy_big": _emscripten_memcpy_big,
	"_exp2": _exp2,
	"_sysconf": _sysconf,
	"_cos": _cos,
	"_lrintf": _lrintf,
	"_llvm_stacksave": _llvm_stacksave,
	"_floorf": _floorf,
	"_log": _log,
	"___errno_location": ___errno_location,
	"_abort": _abort,
	"_time": _time,
	"_rint": _rint,
	"_sqrt": _sqrt,
	"STACKTOP": STACKTOP,
	"STACK_MAX": STACK_MAX,
	"tempDoublePtr": tempDoublePtr,
	"ABORT": ABORT,
	"cttz_i8": cttz_i8,
	"ctlz_i8": ctlz_i8,
	"NaN": NaN,
	"Infinity": Infinity
}; // EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
	"use asm";
	var a = new global.Int8Array(buffer);
	var b = new global.Int16Array(buffer);
	var c = new global.Int32Array(buffer);
	var d = new global.Uint8Array(buffer);
	var e = new global.Uint16Array(buffer);
	var f = new global.Uint32Array(buffer);
	var g = new global.Float32Array(buffer);
	var h = new global.Float64Array(buffer);
	var i = env.STACKTOP | 0;
	var j = env.STACK_MAX | 0;
	var k = env.tempDoublePtr | 0;
	var l = env.ABORT | 0;
	var m = env.cttz_i8 | 0;
	var n = env.ctlz_i8 | 0;
	var o = 0;
	var p = 0;
	var q = 0;
	var r = 0;
	var s = +env.NaN,
		t = +env.Infinity;
	var u = 0,
		v = 0,
		w = 0,
		x = 0,
		y = 0.0,
		z = 0,
		A = 0,
		B = 0,
		C = 0.0;
	var D = 0;
	var E = 0;
	var F = 0;
	var G = 0;
	var H = 0;
	var I = 0;
	var J = 0;
	var K = 0;
	var L = 0;
	var M = 0;
	var N = global.Math.floor;
	var O = global.Math.abs;
	var P = global.Math.sqrt;
	var Q = global.Math.pow;
	var R = global.Math.cos;
	var S = global.Math.sin;
	var T = global.Math.tan;
	var U = global.Math.acos;
	var V = global.Math.asin;
	var W = global.Math.atan;
	var X = global.Math.atan2;
	var Y = global.Math.exp;
	var Z = global.Math.log;
	var _ = global.Math.ceil;
	var $ = global.Math.imul;
	var aa = env.abort;
	var ba = env.assert;
	var ca = env.min;
	var da = env.invoke_viiiiiii;
	var ea = env._exp;
	var fa = env._llvm_pow_f64;
	var ga = env._sqrtf;
	var ha = env._atan2;
	var ia = env.___setErrNo;
	var ja = env._llvm_stackrestore;
	var ka = env._floor;
	var la = env._log10;
	var ma = env._fabsf;
	var na = env._sbrk;
	var oa = env._emscripten_memcpy_big;
	var pa = env._exp2;
	var qa = env._sysconf;
	var ra = env._cos;
	var sa = env._lrintf;
	var ta = env._llvm_stacksave;
	var ua = env._floorf;
	var va = env._log;
	var wa = env.___errno_location;
	var xa = env._abort;
	var ya = env._time;
	var za = env._rint;
	var Aa = env._sqrt;
	var Ba = 0.0;
	// EMSCRIPTEN_START_FUNCS

	function Da(a) {
		a = a | 0;
		var b = 0;
		b = i;
		i = i + a | 0;
		i = i + 15 & -16;
		return b | 0
	}
	function Ea() {
		return i | 0
	}
	function Fa(a) {
		a = a | 0;
		i = a
	}
	function Ga(a, b) {
		a = a | 0;
		b = b | 0;
		if (!o) {
			o = a;
			p = b
		}
	}
	function Ha(b) {
		b = b | 0;
		a[k >> 0] = a[b >> 0];
		a[k + 1 >> 0] = a[b + 1 >> 0];
		a[k + 2 >> 0] = a[b + 2 >> 0];
		a[k + 3 >> 0] = a[b + 3 >> 0]
	}
	function Ia(b) {
		b = b | 0;
		a[k >> 0] = a[b >> 0];
		a[k + 1 >> 0] = a[b + 1 >> 0];
		a[k + 2 >> 0] = a[b + 2 >> 0];
		a[k + 3 >> 0] = a[b + 3 >> 0];
		a[k + 4 >> 0] = a[b + 4 >> 0];
		a[k + 5 >> 0] = a[b + 5 >> 0];
		a[k + 6 >> 0] = a[b + 6 >> 0];
		a[k + 7 >> 0] = a[b + 7 >> 0]
	}
	function Ja(a) {
		a = a | 0;
		D = a
	}
	function Ka() {
		return D | 0
	}
	function La(a, b) {
		a = +a;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0;
		c = i;
		d = 0;
		while (1) {
			if ((d | 0) >= 21) break;
			if (+g[320 + (d << 2) >> 2] > a) break;
			d = d + 1 | 0
		}
		if ((d | 0) > (b | 0) ? +g[320 + (b << 2) >> 2] + +g[408 + (b << 2) >> 2] > a : 0) {
			d = b;
			i = c;
			return d | 0
		}
		if ((d | 0) >= (b | 0)) {
			i = c;
			return d | 0
		}
		e = b + -1 | 0;
		if (!(+g[320 + (e << 2) >> 2] - +g[408 + (e << 2) >> 2] < a)) {
			e = d;
			i = c;
			return e | 0
		}
		e = b;
		i = c;
		return e | 0
	}
	function Ma(a) {
		a = a | 0;
		a = ($(a, 1664525) | 0) + 1013904223 | 0;
		return a | 0
	}
	function Na(a, d, e, f, h, j) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0,
			t = 0;
		m = i;
		k = c[a + 32 >> 2] | 0;
		l = c[a + 44 >> 2] << j;
		n = a + 8 | 0;
		a = 0;
		do {
			o = $(a, l) | 0;
			p = 0;
			while (1) {
				if ((p | 0) >= (f | 0)) break;
				s = b[k + (p << 1) >> 1] | 0;
				t = d + (o + (s << j) << 2) | 0;
				q = p + 1 | 0;
				r = +P(+(+Oa(t, t, (b[k + (q << 1) >> 1] | 0) - s << j) + 1.0000000272452012e-27));
				g[e + (p + ($(a, c[n >> 2] | 0) | 0) << 2) >> 2] = r;
				p = q
			}
			a = a + 1 | 0
		} while ((a | 0) < (h | 0));
		i = m;
		return
	}
	function Oa(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		f = 0;
		e = 0.0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			h = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = h
		}
		i = d;
		return +e
	}
	function Pa(a, d, e, f, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		n = i;
		l = c[a + 32 >> 2] | 0;
		m = $(c[a + 44 >> 2] | 0, k) | 0;
		o = a + 8 | 0;
		a = 0;
		while (1) {
			p = $(a, m) | 0;
			r = 0;
			a: while (1) {
				if ((r | 0) >= (h | 0)) break;
				q = 1.0 / (+g[f + (r + ($(a, c[o >> 2] | 0) | 0) << 2) >> 2] + 1.0000000272452012e-27);
				t = $(b[l + (r << 1) >> 1] | 0, k) | 0;
				r = r + 1 | 0;
				s = $(b[l + (r << 1) >> 1] | 0, k) | 0;
				while (1) {
					if ((t | 0) >= (s | 0)) continue a;
					u = t + p | 0;
					g[e + (u << 2) >> 2] = +g[d + (u << 2) >> 2] * q;
					t = t + 1 | 0
				}
			}
			a = a + 1 | 0;
			if ((a | 0) >= (j | 0)) break
		}
		i = n;
		return
	}
	function Qa(a, d, e, f, h, j, k, l, m) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0.0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		o = i;
		n = c[a + 32 >> 2] | 0;
		a = $(c[a + 44 >> 2] | 0, k) | 0;
		q = $(b[n + (j << 1) >> 1] | 0, k) | 0;
		if ((l | 0) != 1) {
			t = (a | 0) / (l | 0) | 0;
			q = (q | 0) < (t | 0) ? q : t
		}
		r = (m | 0) == 0;
		m = r ? q : 0;
		j = r ? j : 0;
		h = r ? h : 0;
		r = n + (h << 1) | 0;
		s = b[r >> 1] | 0;
		l = d + (($(s << 16 >> 16, k) | 0) << 2) | 0;
		q = e;
		d = 0;
		while (1) {
			if ((d | 0) >= ($(s << 16 >> 16, k) | 0)) {
				r = h;
				break
			}
			g[q >> 2] = 0.0;
			s = b[r >> 1] | 0;
			q = q + 4 | 0;
			d = d + 1 | 0
		}
		a: while (1) {
			if ((r | 0) >= (j | 0)) break;
			s = $(b[n + (r << 1) >> 1] | 0, k) | 0;
			d = r + 1 | 0;
			h = $(b[n + (d << 1) >> 1] | 0, k) | 0;
			p = +Y(+((+g[f + (r << 2) >> 2] + +g[20656 + (r << 2) >> 2]) * .6931471805599453));
			t = l;
			while (1) {
				l = t + 4 | 0;
				r = q + 4 | 0;
				g[q >> 2] = +g[t >> 2] * p;
				s = s + 1 | 0;
				if ((s | 0) < (h | 0)) {
					q = r;
					t = l
				} else {
					q = r;
					r = d;
					continue a
				}
			}
		}
		wj(e + (m << 2) | 0, 0, a - m << 2 | 0) | 0;
		i = o;
		return
	}
	function Ra(a, e, f, h, j, k, l, m, n, o, p, q, r, s) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		var t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0.0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0.0,
			H = 0.0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0.0,
			N = 0;
		u = i;
		t = a + 32 | 0;
		w = a + 8 | 0;
		v = (j | 0) == 1;
		x = (h | 0) == 3;
		a = 1 << h;
		a: while (1) {
			if ((l | 0) >= (m | 0)) break;
			C = l + 1 | 0;
			B = c[t >> 2] | 0;
			B = (b[B + (C << 1) >> 1] | 0) - (b[B + (l << 1) >> 1] | 0) | 0;
			A = +Y(+(+((Sa((c[q + (l << 2) >> 2] | 0) + 1 | 0, B) | 0) >>> h | 0) * -.125 * .6931471805599453)) * .5;
			D = B << h;
			z = 1.0 / +P(+(+(D | 0)));
			y = $(l, j) | 0;
			E = 0;
			while (1) {
				I = c[w >> 2] | 0;
				F = ($(E, I) | 0) + l | 0;
				M = +g[o + (F << 2) >> 2];
				G = +g[p + (F << 2) >> 2];
				if (v) {
					L = I + l | 0;
					H = +g[o + (L << 2) >> 2];
					M = M > H ? M : H;
					H = +g[p + (L << 2) >> 2];
					if (!(G > H)) G = H
				}
				G = +g[n + (F << 2) >> 2] - (M < G ? M : G);
				G = +Y(+(-(G < 0.0 ? 0.0 : G) * .6931471805599453)) * 2.0;
				if (x) G = G * 1.4142135381698608;
				G = (A < G ? A : G) * z;
				F = $(E, k) | 0;
				F = F + (b[(c[t >> 2] | 0) + (l << 1) >> 1] << h) | 0;
				J = e + (F << 2) | 0;
				I = f + (y + E) | 0;
				H = -G;
				L = 0;
				K = 0;
				while (1) {
					if ((K | 0) >= (a | 0)) break;
					b: do
					if (!(d[I >> 0] & 1 << K)) {
						L = 0;
						while (1) {
							if ((L | 0) >= (B | 0)) {
								L = 1;
								break b
							}
							N = Ma(r) | 0;
							g[e + (F + ((L << h) + K) << 2) >> 2] = (N & 32768 | 0) == 0 ? H : G;
							r = N;
							L = L + 1 | 0
						}
					}
					while (0);
					K = K + 1 | 0
				}
				if (L) Ad(J, D, 1.0, s);
				E = E + 1 | 0;
				if ((E | 0) >= (j | 0)) {
					l = C;
					continue a
				}
			}
		}
		i = u;
		return
	}
	function Sa(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function Ta(a, d, e, f, h, j, k, l, m, n) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0.0,
			D = 0,
			E = 0.0;
		o = i;
		q = c[a + 32 >> 2] | 0;
		r = $(c[a + 44 >> 2] | 0, n) | 0;
		if (($((b[q + (l << 1) >> 1] | 0) - (b[q + (l + -1 << 1) >> 1] | 0) | 0, n) | 0) < 9) {
			D = 0;
			i = o;
			return D | 0
		}
		s = a + 8 | 0;
		z = 0;
		x = 0;
		p = 0;
		y = 0;
		a = 0;
		a: while (1) {
			A = y;
			while (1) {
				if ((A | 0) < (l | 0)) break;
				z = z + 1 | 0;
				if ((z | 0) < (m | 0)) A = 0;
				else break a
			}
			w = b[q + (A << 1) >> 1] | 0;
			B = ($(w, n) | 0) + ($(z, r) | 0) | 0;
			y = A + 1 | 0;
			w = $((b[q + (y << 1) >> 1] | 0) - w | 0, n) | 0;
			if ((w | 0) < 9) continue;
			C = +(w | 0);
			D = 0;
			u = 0;
			v = 0;
			t = 0;
			while (1) {
				if ((D | 0) >= (w | 0)) break;
				E = +g[d + (B + D << 2) >> 2];
				E = E * E * C;
				D = D + 1 | 0;
				u = E < .25 ? u + 1 | 0 : u;
				v = E < .0625 ? v + 1 | 0 : v;
				t = E < .015625 ? t + 1 | 0 : t
			}
			if ((A | 0) > ((c[s >> 2] | 0) + -4 | 0)) x = x + (Sa(v + u << 5, w) | 0) | 0;
			p = p + 1 | 0;
			a = a + (((t << 1 | 0) >= (w | 0) & 1) + ((v << 1 | 0) >= (w | 0) & 1) + ((u << 1 | 0) >= (w | 0) & 1) << 8) | 0
		}
		do
		if (k) {
			if (!x) k = 0;
			else k = Sa(x, $(4 - (c[s >> 2] | 0) + l | 0, m) | 0) | 0;
			k = (c[h >> 2] | 0) + k >> 1;
			c[h >> 2] = k;
			h = c[j >> 2] | 0;
			if ((h | 0) == 2) k = k + 4 | 0;
			else if (!h) k = k + -4 | 0;
			if ((k | 0) > 22) {
				c[j >> 2] = 2;
				break
			}
			if ((k | 0) > 18) {
				c[j >> 2] = 1;
				break
			} else {
				c[j >> 2] = 0;
				break
			}
		}
		while (0);
		D = Sa(a, p) | 0;
		D = D + (c[e >> 2] | 0) >> 1;
		c[e >> 2] = D;
		f = (D * 3 | 0) + (3 - f << 7 | 64) + 2 >> 2;
		if ((f | 0) < 80) {
			D = 3;
			i = o;
			return D | 0
		}
		if ((f | 0) < 256) {
			D = 2;
			i = o;
			return D | 0
		} else {
			i = o;
			return ((f | 0) < 384 ? 1 : 0) | 0
		}
		return 0
	}
	function Ua(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0;
		d = i;
		b = b >> 1;
		f = c << 1;
		e = 0;
		while (1) {
			if ((e | 0) < (c | 0)) h = 0;
			else break;
			while (1) {
				if ((h | 0) >= (b | 0)) break;
				m = a + (($(f, h) | 0) + e << 2) | 0;
				l = +g[m >> 2] * .7071067690849304;
				j = a + (($(h << 1 | 1, c) | 0) + e << 2) | 0;
				k = +g[j >> 2] * .7071067690849304;
				g[m >> 2] = l + k;
				g[j >> 2] = l - k;
				h = h + 1 | 0
			}
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function Va(e, f, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		x = x | 0;
		y = y | 0;
		z = z | 0;
		A = A | 0;
		var B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0;
		B = i;
		i = i + 48 | 0;
		F = B;
		D = c[f + 32 >> 2] | 0;
		H = (l | 0) != 0 ? 2 : 1;
		E = (e | 0) == 0;
		L = (p | 0) == 0 ? 1 : 1 << x;
		I = D + (h << 1) | 0;
		p = b[I >> 1] << x;
		aa = b[D + ((c[f + 8 >> 2] | 0) + -1 << 1) >> 1] | 0;
		K = $(H, (aa << 16 >> 16 << x) - p | 0) | 0;
		J = i;
		i = i + ((4 * K | 0) + 15 & -16) | 0;
		aa = aa << 16 >> 16 << x;
		K = aa - p | 0;
		c[F + 32 >> 2] = n;
		c[F + 24 >> 2] = w;
		c[F >> 2] = e;
		c[F + 12 >> 2] = s;
		c[F + 4 >> 2] = f;
		e = F + 36 | 0;
		c[e >> 2] = c[z >> 2];
		c[F + 16 >> 2] = q;
		c[F + 40 >> 2] = A;
		P = F + 8 | 0;
		A = j + -1 | 0;
		N = (l | 0) == 0;
		O = F + 28 | 0;
		Q = y + -1 | 0;
		n = F + 20 | 0;
		f = f + 12 | 0;
		R = (1 << L) + -1 | 0;
		q = (q | 0) == 3;
		S = (L | 0) > 1;
		Y = 0;
		aa = k + (aa << 2) | 0;
		T = h;
		da = 1;
		while (1) {
			if ((T | 0) >= (j | 0)) break;
			c[P >> 2] = T;
			Z = (T | 0) == (A | 0);
			_ = D + (T << 1) | 0;
			V = b[_ >> 1] << x;
			ca = k + (V << 2) | 0;
			if (N) ba = 0;
			else ba = l + (V << 2) | 0;
			U = T + 1 | 0;
			W = (b[D + (U << 1) >> 1] << x) - V | 0;
			V = jc(w) | 0;
			v = (T | 0) == (h | 0) ? v : v - V | 0;
			X = u - V | 0;
			c[O >> 2] = X + -1;
			if ((T | 0) <= (Q | 0) ? (C = y - T | 0, C = Wa(v, (C | 0) > 3 ? 3 : C) | 0, C = (c[o + (T << 2) >> 2] | 0) + C | 0, G = (X | 0) < (C | 0), !(((G ? X : C) | 0) <= 16383 & ((G ? X : C) | 0) < 0)) : 0) if (((G ? X : C) | 0) > 16383) X = 16383;
			else X = G ? X : C;
			else X = 0;
			if (E ? ((b[_ >> 1] << x) - W | 0) >= (b[I >> 1] << x | 0) : 0) Y = (da | 0) != 0 | (Y | 0) == 0 ? T : Y;
			da = c[t + (T << 2) >> 2] | 0;
			c[n >> 2] = da;
			if ((T | 0) >= (c[f >> 2] | 0)) {
				ca = J;
				ba = N ? ba : J;
				aa = 0
			}
			aa = Z ? 0 : aa;
			if ((Y | 0) != 0 ? q ^ 1 | S | (da | 0) < 0 : 0) {
				fa = (b[D + (Y << 1) >> 1] << x) - p - W | 0;
				fa = (fa | 0) < 0 ? 0 : fa;
				da = fa + p | 0;
				ha = Y;
				do ha = ha + -1 | 0;
				while ((b[D + (ha << 1) >> 1] << x | 0) > (da | 0));
				da = da + W | 0;
				ga = Y + -1 | 0;
				do ga = ga + 1 | 0;
				while ((b[D + (ga << 1) >> 1] << x | 0) < (da | 0));
				ea = 0;
				da = 0;
				do {
					ja = $(ha, H) | 0;
					ea = ea | d[m + ja >> 0];
					da = da | d[m + (ja + H + -1) >> 0];
					ha = ha + 1 | 0
				} while ((ha | 0) < (ga | 0))
			} else {
				fa = -1;
				ea = R;
				da = R
			}
			a: do
			if (r) {
				if ((T | 0) == (s | 0)) {
					if (!E) {
						M = 37;
						break
					}
					r = D + (s << 1) | 0;
					M = 0;
					while (1) {
						if ((M | 0) >= ((b[r >> 1] << x) - p | 0)) {
							M = 37;
							break a
						}
						ja = J + (M << 2) | 0;
						g[ja >> 2] = (+g[ja >> 2] + +g[J + (K + M << 2) >> 2]) * .5;
						M = M + 1 | 0
					}
				}
				if (r) {
					ga = (X | 0) / 2 | 0;
					ha = (fa | 0) == -1;
					if (ha) ia = 0;
					else ia = J + (fa << 2) | 0;
					if (Z) ja = 0;
					else ja = J + ((b[_ >> 1] << x) - p << 2) | 0;
					ca = Xa(F, ca, W, ga, L, ia, x, ja, 1.0, aa, ea) | 0;
					if (ha) ea = 0;
					else ea = J + (K + fa << 2) | 0;
					if (Z) Z = 0;
					else Z = J + (K + ((b[_ >> 1] << x) - p) << 2) | 0;
					Z = Xa(F, ba, W, ga, L, ea, x, Z, 1.0, aa, da) | 0
				} else M = 37
			} else M = 37;
			while (0);
			do
			if ((M | 0) == 37) {
				M = 0;
				r = (fa | 0) == -1;
				if (!ba) {
					if (r) ba = 0;
					else ba = J + (fa << 2) | 0;
					if (Z) Z = 0;
					else Z = J + ((b[_ >> 1] << x) - p << 2) | 0;
					ca = Xa(F, ca, W, X, L, ba, x, Z, 1.0, aa, ea | da) | 0;
					r = 0;
					Z = ca;
					break
				} else {
					if (r) r = 0;
					else r = J + (fa << 2) | 0;
					if (Z) Z = 0;
					else Z = J + ((b[_ >> 1] << x) - p << 2) | 0;
					ca = Ya(F, ca, ba, W, X, L, r, x, Z, aa, ea | da) | 0;
					r = 0;
					Z = ca;
					break
				}
			}
			while (0);
			da = $(T, H) | 0;
			a[m + da >> 0] = ca;
			a[m + (da + H + -1) >> 0] = Z;
			v = v + ((c[o + (T << 2) >> 2] | 0) + V) | 0;
			T = U;
			da = (X | 0) > (W << 3 | 0) & 1
		}
		c[z >> 2] = c[e >> 2];
		i = B;
		return
	}
	function Wa(a, b) {
		a = a | 0;
		b = b | 0;
		return (a | 0) / (b | 0) | 0 | 0
	}
	function Xa(a, b, e, f, h, j, k, l, m, n, o) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = +m;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		p = i;
		s = (c[a >> 2] | 0) == 0;
		t = c[a + 20 >> 2] | 0;
		r = (h | 0) == 1 & 1;
		u = Sa(e, h) | 0;
		if ((e | 0) == 1) {
			Za(a, b, 0, f, l);
			o = 1;
			i = p;
			return o | 0
		}
		q = (t | 0) > 0 ? t : 0;
		do
		if (n) if (!j) j = 0;
		else {
			if ((q | 0) == 0 ? !((u & 1 | 0) == 0 & (t | 0) < 0 | (h | 0) > 1) : 0) break;
			yj(n | 0, j | 0, e << 2 | 0) | 0;
			j = n
		}
		while (0);
		n = (j | 0) == 0;
		v = 0;
		while (1) {
			if ((v | 0) >= (q | 0)) break;
			if (!s) Ua(b, e >> v, 1 << v);
			if (!n) Ua(j, e >> v, 1 << v);
			o = d[24 + (o & 15) >> 0] | 0 | (d[24 + (o >> 4) >> 0] | 0) << 2;
			v = v + 1 | 0
		}
		h = h >> q;
		v = u << q;
		u = 0;
		while (1) {
			if (!((v & 1 | 0) == 0 & (t | 0) < 0)) break;
			if (!s) Ua(b, v, h);
			if (!n) Ua(j, v, h);
			w = o | o << h;
			h = h << 1;
			o = w;
			v = v >> 1;
			t = t + 1 | 0;
			u = u + 1 | 0
		}
		t = (h | 0) > 1;
		if (t) {
			if (!s) gb(b, v >> q, h << q, r);
			if (!n) gb(j, v >> q, h << q, r)
		}
		a = hb(a, b, e, f, h, j, k, m, o) | 0;
		if (!s) {
			w = a;
			i = p;
			return w | 0
		}
		if (t) {
			ib(b, v >> q, h << q, r);
			r = 0
		} else r = 0;
		while (1) {
			if ((r | 0) >= (u | 0)) {
				r = 0;
				break
			}
			w = h >> 1;
			o = v << 1;
			Ua(b, o, w);
			h = w;
			v = o;
			a = a | a >>> w;
			r = r + 1 | 0
		}
		while (1) {
			if ((r | 0) >= (q | 0)) break;
			w = d[40 + a >> 0] | 0;
			Ua(b, e >> r, 1 << r);
			a = w;
			r = r + 1 | 0
		}
		q = h << q;
		a: do
		if (l) {
			m = +P(+(+(e | 0)));
			r = 0;
			while (1) {
				if ((r | 0) >= (e | 0)) break a;
				g[l + (r << 2) >> 2] = m * +g[b + (r << 2) >> 2];
				r = r + 1 | 0
			}
		}
		while (0);
		w = a & (1 << q) + -1;
		i = p;
		return w | 0
	}
	function Ya(a, b, d, e, f, h, j, k, l, m, n) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0.0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0;
		o = i;
		i = i + 32 | 0;
		y = o + 28 | 0;
		u = o + 24 | 0;
		x = o;
		c[y >> 2] = f;
		c[u >> 2] = n;
		p = (c[a >> 2] | 0) == 0;
		w = c[a + 24 >> 2] | 0;
		if ((e | 0) == 1) {
			Za(a, b, d, f, l);
			y = 1;
			i = o;
			return y | 0
		}
		_a(a, x, b, d, e, y, h, h, k, 1, u);
		r = c[x >> 2] | 0;
		t = c[x + 16 >> 2] | 0;
		v = c[x + 20 >> 2] | 0;
		q = +(c[x + 4 >> 2] | 0) * 30517578125.0e-15;
		s = +(c[x + 8 >> 2] | 0) * 30517578125.0e-15;
		f = (e | 0) == 2;
		do
		if (f) {
			if ((t | 0) == 16384 | (t | 0) == 0) u = 0;
			else u = 8;
			x = (c[y >> 2] | 0) - u | 0;
			t = (t | 0) > 8192;
			y = a + 28 | 0;
			c[y >> 2] = (c[y >> 2] | 0) - (v + u);
			v = t ? d : b;
			t = t ? b : d;
			do
			if (u) if (p) {
				u = uc(w, 1) | 0;
				break
			} else {
				u = +g[v >> 2] * +g[t + 4 >> 2] - +g[v + 4 >> 2] * +g[t >> 2] < 0.0 & 1;
				Ec(w, u, 1);
				break
			} else u = 0;
			while (0);
			y = 1 - (u << 1) | 0;
			h = Xa(a, v, 2, x, h, j, k, l, 1.0, m, n) | 0;
			g[t >> 2] = +(0 - y | 0) * +g[v + 4 >> 2];
			g[t + 4 >> 2] = +(y | 0) * +g[v >> 2];
			if (p) {
				g[b >> 2] = q * +g[b >> 2];
				x = b + 4 | 0;
				g[x >> 2] = q * +g[x >> 2];
				z = s * +g[d >> 2];
				g[d >> 2] = z;
				y = d + 4 | 0;
				g[y >> 2] = s * +g[y >> 2];
				s = +g[b >> 2];
				g[b >> 2] = s - z;
				g[d >> 2] = s + +g[d >> 2];
				s = +g[x >> 2];
				g[x >> 2] = s - +g[y >> 2];
				g[y >> 2] = s + +g[y >> 2];
				break
			} else {
				y = h;
				i = o;
				return y | 0
			}
		} else {
			w = c[y >> 2] | 0;
			x = (w - (c[x + 12 >> 2] | 0) | 0) / 2 | 0;
			n = (w | 0) < (x | 0);
			if (((n ? w : x) | 0) < 0) n = 0;
			else n = n ? w : x;
			w = w - n | 0;
			x = a + 28 | 0;
			v = (c[x >> 2] | 0) - v | 0;
			c[x >> 2] = v;
			u = c[u >> 2] | 0;
			if ((n | 0) < (w | 0)) {
				y = Xa(a, d, e, w, h, 0, k, 0, s, 0, u >> h) | 0;
				v = w + ((c[x >> 2] | 0) - v) | 0;
				if (!((v | 0) <= 24 | (t | 0) == 16384)) n = n + (v + -24) | 0;
				h = y | (Xa(a, b, e, n, h, j, k, l, 1.0, m, u) | 0)
			} else {
				m = Xa(a, b, e, n, h, j, k, l, 1.0, m, u) | 0;
				j = n + ((c[x >> 2] | 0) - v) | 0;
				if (!((j | 0) <= 24 | (t | 0) == 0)) w = w + (j + -24) | 0;
				h = m | (Xa(a, d, e, w, h, 0, k, 0, s, 0, u >> h) | 0)
			}
			if (!p) {
				y = h;
				i = o;
				return y | 0
			}
		}
		while (0);
		if (!f) $a(b, d, q, e);
		if (!r) {
			y = h;
			i = o;
			return y | 0
		} else b = 0;
		while (1) {
			if ((b | 0) >= (e | 0)) break;
			y = d + (b << 2) | 0;
			g[y >> 2] = -+g[y >> 2];
			b = b + 1 | 0
		}
		i = o;
		return h | 0
	}
	function Za(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		l = i;
		j = (c[a >> 2] | 0) == 0;
		k = c[a + 24 >> 2] | 0;
		h = (d | 0) != 0 & 1;
		a = a + 28 | 0;
		m = 0;
		n = b;
		while (1) {
			if ((c[a >> 2] | 0) > 7) {
				if (j) o = uc(k, 1) | 0;
				else {
					o = +g[n >> 2] < 0.0 & 1;
					Ec(k, o, 1)
				}
				c[a >> 2] = (c[a >> 2] | 0) + -8;
				e = e + -8 | 0
			} else o = 0;
			if (j) g[n >> 2] = (o | 0) != 0 ? -1.0 : 1.0;
			if ((m | 0) >= (h | 0)) break;
			m = m + 1 | 0;
			n = d
		}
		if (!f) {
			i = l;
			return
		}
		g[f >> 2] = +g[b >> 2];
		i = l;
		return
	}
	function _a(a, d, e, f, h, j, k, l, m, n, o) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0;
		p = i;
		u = c[a >> 2] | 0;
		s = c[a + 4 >> 2] | 0;
		t = c[a + 8 >> 2] | 0;
		v = c[a + 12 >> 2] | 0;
		q = c[a + 24 >> 2] | 0;
		r = c[a + 32 >> 2] | 0;
		z = (b[(c[s + 56 >> 2] | 0) + (t << 1) >> 1] | 0) + (m << 3) | 0;
		y = z >> 1;
		m = (n | 0) == 0;
		if (m) {
			v = c[j >> 2] | 0;
			x = v;
			v = bb(h, v, y - 4 | 0, z, n) | 0
		} else {
			x = c[j >> 2] | 0;
			z = bb(h, x, y - ((h | 0) == 2 ? 16 : 4) | 0, z, n) | 0;
			v = (t | 0) < (v | 0) ? z : 1
		}
		u = (u | 0) == 0;
		if (u) y = 0;
		else y = Cd(e, f, n, h, c[a + 40 >> 2] | 0) | 0;
		n = jc(q) | 0;
		a: do
		if ((v | 0) == 1) if (!m) {
			if (u) m = 0;
			else {
				z = (y | 0) > 8192;
				m = z & 1;
				b: do
				if (z) {
					v = 0;
					while (1) {
						if ((v | 0) >= (h | 0)) break b;
						z = f + (v << 2) | 0;
						g[z >> 2] = -+g[z >> 2];
						v = v + 1 | 0
					}
				}
				while (0);
				cb(s, e, f, r, t, h);
				x = c[j >> 2] | 0
			}
			if ((x | 0) > 16 ? (c[a + 28 >> 2] | 0) > 16 : 0) if (u) {
				m = rc(q, 2) | 0;
				y = 0;
				break
			} else {
				Bc(q, m, 2);
				y = 0;
				break
			} else {
				m = 0;
				y = 0
			}
		} else m = 0;
		else {
			if (u) a = y;
			else a = ($(y, v) | 0) + 8192 >> 14;
			do
			if (!((m ^ 1) & (h | 0) > 2)) {
				if ((l | 0) > 1 | m ^ 1) {
					l = v + 1 | 0;
					if (u) {
						m = 0;
						y = Sa((tc(q, l) | 0) << 14, v) | 0;
						break a
					} else {
						Dc(q, a, l);
						y = Sa(a << 14, v) | 0;
						break
					}
				}
				x = v >> 1;
				l = x + 1 | 0;
				w = $(l, l) | 0;
				if (u) {
					a = nc(q, w) | 0;
					if ((a | 0) < (($(x, l) | 0) >> 1 | 0)) {
						z = ((Uc(a << 3 | 1) | 0) + -1 | 0) >>> 1;
						x = z + 1 | 0;
						l = x;
						a = z;
						x = ($(z, x) | 0) >>> 1
					} else {
						x = ((v << 1) + 2 - (Uc((w - a << 3) + -7 | 0) | 0) | 0) >>> 1;
						z = v + 1 - x | 0;
						l = z;
						a = x;
						x = w - (($(z, v + 2 - x | 0) | 0) >> 1) | 0
					}
					qc(q, x, x + l | 0, w);
					w = 35;
					break
				} else {
					if ((a | 0) > (x | 0)) {
						l = v + 1 - a | 0;
						x = w - (($(v + 1 - a | 0, v + 2 - a | 0) | 0) >> 1) | 0
					} else {
						l = a + 1 | 0;
						x = ($(a, a + 1 | 0) | 0) >> 1
					}
					xc(q, x, x + l | 0, w);
					w = 35;
					break
				}
			} else {
				l = (v | 0) / 2 | 0;
				w = (l * 3 | 0) + 3 + l | 0;
				if (!u) {
					if ((a | 0) > (l | 0)) {
						x = a + -1 - l + ((l * 3 | 0) + 3) | 0;
						l = a - l + ((l * 3 | 0) + 3) | 0
					} else {
						x = a * 3 | 0;
						l = (a * 3 | 0) + 3 | 0
					}
					xc(q, x, l, w);
					w = 35;
					break
				}
				y = nc(q, w) | 0;
				a = l + 1 | 0;
				x = a * 3 | 0;
				if ((y | 0) < (x | 0)) a = (y | 0) / 3 | 0;
				else a = a + (y - x) | 0;
				if ((a | 0) > (l | 0)) {
					y = a + -1 - l + x | 0;
					l = a - l + x | 0
				} else {
					y = a * 3 | 0;
					l = (a * 3 | 0) + 3 | 0
				}
				qc(q, y, l, w);
				w = 35
			}
			while (0);
			if ((w | 0) == 35) {
				y = Sa(a << 14, v) | 0;
				if (u) {
					m = 0;
					break
				}
			}
			if (!m) if (!y) {
				cb(s, e, f, r, t, h);
				m = 0;
				y = 0;
				break
			} else {
				db(e, f, h);
				m = 0;
				break
			} else m = 0
		}
		while (0);
		q = (jc(q) | 0) - n | 0;
		c[j >> 2] = (c[j >> 2] | 0) - q;
		if (!y) {
			c[o >> 2] = c[o >> 2] & (1 << k) + -1;
			w = 32767;
			l = 0;
			x = -16384;
			c[d >> 2] = m;
			z = d + 4 | 0;
			c[z >> 2] = w;
			z = d + 8 | 0;
			c[z >> 2] = l;
			z = d + 12 | 0;
			c[z >> 2] = x;
			z = d + 16 | 0;
			c[z >> 2] = y;
			z = d + 20 | 0;
			c[z >> 2] = q;
			i = p;
			return
		} else if ((y | 0) == 16384) {
			c[o >> 2] = c[o >> 2] & (1 << k) + -1 << k;
			w = 0;
			l = 32767;
			x = 16384;
			c[d >> 2] = m;
			z = d + 4 | 0;
			c[z >> 2] = w;
			z = d + 8 | 0;
			c[z >> 2] = l;
			z = d + 12 | 0;
			c[z >> 2] = x;
			z = d + 16 | 0;
			c[z >> 2] = y;
			z = d + 20 | 0;
			c[z >> 2] = q;
			i = p;
			return
		} else {
			x = (eb(y & 65535) | 0) << 16 >> 16;
			z = (eb(16384 - y & 65535) | 0) << 16 >> 16;
			w = x;
			l = z;
			x = ($((h << 23) + -8388608 >> 16, (fb(z, x) | 0) << 16 >> 16) | 0) + 16384 >> 15;
			c[d >> 2] = m;
			z = d + 4 | 0;
			c[z >> 2] = w;
			z = d + 8 | 0;
			c[z >> 2] = l;
			z = d + 12 | 0;
			c[z >> 2] = x;
			z = d + 16 | 0;
			c[z >> 2] = y;
			z = d + 20 | 0;
			c[z >> 2] = q;
			i = p;
			return
		}
	}
	function $a(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0.0,
			j = 0,
			k = 0.0,
			l = 0,
			m = 0.0,
			n = 0;
		e = i;
		i = i + 16 | 0;
		l = e + 4 | 0;
		j = e;
		g[l >> 2] = 0.0;
		g[j >> 2] = 0.0;
		ab(b, a, b, d, l, j);
		h = +g[l >> 2] * c;
		g[l >> 2] = h;
		k = c * c + +g[j >> 2];
		h = h * 2.0;
		f = k - h;
		h = k + h;
		if (h < .0006000000284984708 | f < .0006000000284984708) {
			yj(b | 0, a | 0, d << 2 | 0) | 0;
			i = e;
			return
		}
		f = 1.0 / +P(+f);
		h = 1.0 / +P(+h);
		j = 0;
		while (1) {
			if ((j | 0) >= (d | 0)) break;
			n = a + (j << 2) | 0;
			m = +g[n >> 2] * c;
			l = b + (j << 2) | 0;
			k = +g[l >> 2];
			g[n >> 2] = f * (m - k);
			g[l >> 2] = h * (m + k);
			j = j + 1 | 0
		}
		i = e;
		return
	}
	function ab(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0.0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0.0;
		k = i;
		l = 0;
		h = 0.0;
		j = 0.0;
		while (1) {
			if ((l | 0) >= (d | 0)) break;
			m = +g[a + (l << 2) >> 2];
			n = h + m * +g[b + (l << 2) >> 2];
			m = j + m * +g[c + (l << 2) >> 2];
			l = l + 1 | 0;
			h = n;
			j = m
		}
		g[e >> 2] = h;
		g[f >> 2] = j;
		i = k;
		return
	}
	function bb(a, c, d, e, f) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0;
		g = i;
		h = a << 1;
		f = (f | 0) != 0 & (a | 0) == 2 ? h + -2 | 0 : h + -1 | 0;
		f = Wa(($(f, d) | 0) + c | 0, f) | 0;
		e = c - e + -32 | 0;
		e = (e | 0) < (f | 0) ? e : f;
		if ((e | 0) <= 64) {
			if ((e | 0) < 4) {
				h = 1;
				i = g;
				return h | 0
			}
		} else e = 64;
		h = (b[8 + ((e & 7) << 1) >> 1] >> 14 - (e >> 3)) + 1 & -2;
		i = g;
		return h | 0
	}
	function cb(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0.0,
			l = 0.0,
			m = 0.0;
		j = i;
		k = +g[e + (f << 2) >> 2];
		m = +g[e + ((c[a + 8 >> 2] | 0) + f << 2) >> 2];
		l = +P(+(k * k + 1.0000000036274937e-15 + m * m)) + 1.0000000036274937e-15;
		k = k / l;
		l = m / l;
		f = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) break;
			e = b + (f << 2) | 0;
			g[e >> 2] = k * +g[e >> 2] + l * +g[d + (f << 2) >> 2];
			f = f + 1 | 0
		}
		i = j;
		return
	}
	function db(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0.0,
			j = 0.0,
			k = 0;
		d = i;
		e = 0;
		while (1) {
			if ((e | 0) >= (c | 0)) break;
			k = a + (e << 2) | 0;
			h = +g[k >> 2] * .7071067690849304;
			f = b + (e << 2) | 0;
			j = +g[f >> 2] * .7071067690849304;
			g[k >> 2] = h + j;
			g[f >> 2] = j - h;
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function eb(a) {
		a = a | 0;
		var b = 0;
		a = a << 16 >> 16;
		a = (($(a, a) | 0) + 4096 | 0) >>> 13;
		b = a << 16 >> 16;
		a = 32767 - a + ((($(b, ((($(b, ((($(a << 16 >> 16, -626) | 0) + 16384 | 0) >>> 15 << 16) + 542441472 >> 16) | 0) + 16384 | 0) >>> 15 << 16) + -501415936 >> 16) | 0) + 16384 | 0) >>> 15) + 1 & 65535;
		return a | 0
	}
	function fb(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0;
		c = i;
		e = 32 - (vj(b | 0) | 0) | 0;
		f = 32 - (vj(a | 0) | 0) | 0;
		d = a << 15 - f << 16 >> 16;
		a = b << 15 - e << 16 >> 16;
		a = (f - e << 11) + (($(d, ((($(d, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 >> 15) - (($(a, ((($(a, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 >> 15) | 0;
		i = c;
		return a | 0
	}
	function gb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0;
		h = i;
		j = $(b, d) | 0;
		f = i;
		i = i + ((4 * j | 0) + 15 & -16) | 0;
		if (!e) {
			l = 0;
			while (1) {
				if ((l | 0) >= (d | 0)) break;
				k = $(l, b) | 0;
				e = 0;
				while (1) {
					if ((e | 0) >= (b | 0)) break;
					g[f + (k + e << 2) >> 2] = +g[a + (($(e, d) | 0) + l << 2) >> 2];
					e = e + 1 | 0
				}
				l = l + 1 | 0
			}
			m = j << 2;
			yj(a | 0, f | 0, m | 0) | 0;
			i = h;
			return
		}
		l = d + -2 | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (d | 0)) break;
			k = 56 + (l + m << 2) | 0;
			e = 0;
			while (1) {
				if ((e | 0) >= (b | 0)) break;
				n = +g[a + (($(e, d) | 0) + m << 2) >> 2];
				g[f + (($(c[k >> 2] | 0, b) | 0) + e << 2) >> 2] = n;
				e = e + 1 | 0
			}
			m = m + 1 | 0
		}
		m = j << 2;
		yj(a | 0, f | 0, m | 0) | 0;
		i = h;
		return
	}
	function hb(a, e, f, h, j, k, l, m, n) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = +m;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0;
		o = i;
		i = i + 32 | 0;
		v = o + 28 | 0;
		p = o + 24 | 0;
		w = o;
		c[v >> 2] = h;
		c[p >> 2] = n;
		s = (c[a >> 2] | 0) == 0;
		x = c[a + 4 >> 2] | 0;
		y = c[a + 8 >> 2] | 0;
		r = c[a + 16 >> 2] | 0;
		q = c[a + 24 >> 2] | 0;
		A = c[x + 100 >> 2] | 0;
		z = ($(l + 1 | 0, c[x + 8 >> 2] | 0) | 0) + y | 0;
		z = b[(c[x + 96 >> 2] | 0) + (z << 1) >> 1] | 0;
		if ((l | 0) != -1 ? (f | 0) > 2 ? ((d[A + (z + (d[A + z >> 0] | 0)) >> 0] | 0) + 12 | 0) < (h | 0) : 0 : 0) {
			f = f >> 1;
			s = e + (f << 2) | 0;
			q = l + -1 | 0;
			if ((j | 0) == 1) c[p >> 2] = n & 1 | n << 1;
			n = j + 1 >> 1;
			_a(a, w, e, s, f, v, n, j, q, 0, p);
			y = c[w + 12 >> 2] | 0;
			r = c[w + 16 >> 2] | 0;
			x = c[w + 20 >> 2] | 0;
			t = +(c[w + 4 >> 2] | 0) * 30517578125.0e-15;
			u = +(c[w + 8 >> 2] | 0) * 30517578125.0e-15;
			do
			if ((j | 0) > 1 ? (r & 16383 | 0) != 0 : 0) if ((r | 0) > 8192) {
				y = y - (y >> 5 - l) | 0;
				break
			} else {
				y = y + (f << 3 >> 6 - l) | 0;
				y = (y | 0) > 0 ? 0 : y;
				break
			}
			while (0);
			v = c[v >> 2] | 0;
			l = (v - y | 0) / 2 | 0;
			w = (v | 0) < (l | 0);
			if (((w ? v : l) | 0) < 0) l = 0;
			else l = w ? v : l;
			v = v - l | 0;
			y = a + 28 | 0;
			x = (c[y >> 2] | 0) - x | 0;
			c[y >> 2] = x;
			if (!k) w = 0;
			else w = k + (f << 2) | 0;
			if ((l | 0) < (v | 0)) {
				p = c[p >> 2] | 0;
				j = (hb(a, s, f, v, n, w, q, u * m, p >> n) | 0) << (j >> 1);
				s = v + ((c[y >> 2] | 0) - x) | 0;
				if (!((s | 0) <= 24 | (r | 0) == 16384)) l = l + (s + -24) | 0;
				A = j | (hb(a, e, f, l, n, k, q, t * m, p) | 0);
				i = o;
				return A | 0
			} else {
				p = c[p >> 2] | 0;
				e = hb(a, e, f, l, n, k, q, t * m, p) | 0;
				k = l + ((c[y >> 2] | 0) - x) | 0;
				if (!((k | 0) <= 24 | (r | 0) == 0)) v = v + (k + -24) | 0;
				A = e | (hb(a, s, f, v, n, w, q, u * m, p >> n) | 0) << (j >> 1);
				i = o;
				return A | 0
			}
		}
		z = jb(x, y, l, h) | 0;
		w = kb(x, y, l, z) | 0;
		h = a + 28 | 0;
		v = w;
		w = (c[h >> 2] | 0) - w | 0;
		while (1) {
			c[h >> 2] = w;
			if (!((w | 0) < 0 & (z | 0) > 0)) break;
			B = w + v | 0;
			c[h >> 2] = B;
			C = z + -1 | 0;
			A = kb(x, y, l, C) | 0;
			v = A;
			z = C;
			w = B - A | 0
		}
		if (z) {
			a = lb(z) | 0;
			if (s) {
				C = yd(e, f, a, r, j, q, m) | 0;
				i = o;
				return C | 0
			} else {
				C = vd(e, f, a, r, j, q) | 0;
				i = o;
				return C | 0
			}
		}
		if (!s) {
			C = 0;
			i = o;
			return C | 0
		}
		j = (1 << j) + -1 | 0;
		q = j & n;
		c[p >> 2] = q;
		if (!q) {
			wj(e | 0, 0, f << 2 | 0) | 0;
			C = 0;
			i = o;
			return C | 0
		}
		p = a + 36 | 0;
		a: do
		if (!k) {
			k = 0;
			while (1) {
				if ((k | 0) >= (f | 0)) break a;
				C = Ma(c[p >> 2] | 0) | 0;
				c[p >> 2] = C;
				g[e + (k << 2) >> 2] = +(C >> 20 | 0);
				k = k + 1 | 0
			}
		} else {
			j = 0;
			while (1) {
				if ((j | 0) >= (f | 0)) {
					j = q;
					break a
				}
				C = Ma(c[p >> 2] | 0) | 0;
				c[p >> 2] = C;
				g[e + (j << 2) >> 2] = +g[k + (j << 2) >> 2] + ((C & 32768 | 0) == 0 ? -.00390625 : .00390625);
				j = j + 1 | 0
			}
		}
		while (0);
		Ad(e, f, m, c[a + 40 >> 2] | 0);
		C = j;
		i = o;
		return C | 0
	}
	function ib(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		h = i;
		j = $(b, d) | 0;
		f = i;
		i = i + ((4 * j | 0) + 15 & -16) | 0;
		if (!e) {
			l = 0;
			while (1) {
				if ((l | 0) >= (d | 0)) break;
				e = $(l, b) | 0;
				k = 0;
				while (1) {
					if ((k | 0) >= (b | 0)) break;
					g[f + (($(k, d) | 0) + l << 2) >> 2] = +g[a + (e + k << 2) >> 2];
					k = k + 1 | 0
				}
				l = l + 1 | 0
			}
			m = j << 2;
			yj(a | 0, f | 0, m | 0) | 0;
			i = h;
			return
		}
		l = d + -2 | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (d | 0)) break;
			e = 56 + (l + m << 2) | 0;
			k = 0;
			while (1) {
				if ((k | 0) >= (b | 0)) break;
				g[f + (($(k, d) | 0) + m << 2) >> 2] = +g[a + (($(c[e >> 2] | 0, b) | 0) + k << 2) >> 2];
				k = k + 1 | 0
			}
			m = m + 1 | 0
		}
		m = j << 2;
		yj(a | 0, f | 0, m | 0) | 0;
		i = h;
		return
	}
	function jb(a, e, f, g) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		j = i;
		h = c[a + 100 >> 2] | 0;
		e = ($(f + 1 | 0, c[a + 8 >> 2] | 0) | 0) + e | 0;
		e = b[(c[a + 96 >> 2] | 0) + (e << 1) >> 1] | 0;
		a = g + -1 | 0;
		f = d[h + e >> 0] | 0;
		g = 0;
		k = 0;
		while (1) {
			if ((k | 0) >= 6) break;
			l = g + f + 1 >> 1;
			m = (d[h + (e + l) >> 0] | 0) < (a | 0);
			f = m ? f : l;
			g = m ? l : g;
			k = k + 1 | 0
		}
		if (!g) k = -1;
		else k = d[h + (e + g) >> 0] | 0;
		i = j;
		return ((a - k | 0) > ((d[h + (e + f) >> 0] | 0) - a | 0) ? f : g) | 0
	}
	function kb(a, e, f, g) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0;
		h = i;
		if (!g) {
			g = 0;
			i = h;
			return g | 0
		}
		f = $(f + 1 | 0, c[a + 8 >> 2] | 0) | 0;
		g = (d[(c[a + 100 >> 2] | 0) + ((b[(c[a + 96 >> 2] | 0) + (f + e << 1) >> 1] | 0) + g) >> 0] | 0) + 1 | 0;
		i = h;
		return g | 0
	}
	function lb(a) {
		a = a | 0;
		if ((a | 0) >= 8) a = (a & 7 | 8) << (a >> 3) + -1;
		return a | 0
	}
	function mb(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if ((a | 0) == 8e3) a = 6;
		else if ((a | 0) == 48e3) a = 1;
		else if ((a | 0) == 24e3) a = 2;
		else if ((a | 0) == 16e3) a = 3;
		else if ((a | 0) == 12e3) a = 4;
		else a = 0;
		i = b;
		return a | 0
	}
	function nb(a, b, c, d, e, f, h, j, k, l, m) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = +f;
		h = +h;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0.0,
			o = 0,
			p = 0.0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0.0;
		o = i;
		if (f == 0.0 & h == 0.0) {
			if ((b | 0) == (a | 0)) {
				i = o;
				return
			}
			zj(a | 0, b | 0, e << 2 | 0) | 0;
			i = o;
			return
		}
		s = +g[176 + (j * 12 | 0) >> 2] * f;
		t = +g[180 + (j * 12 | 0) >> 2] * f;
		n = +g[184 + (j * 12 | 0) >> 2] * f;
		p = +g[176 + (k * 12 | 0) >> 2] * h;
		q = +g[180 + (k * 12 | 0) >> 2] * h;
		r = +g[184 + (k * 12 | 0) >> 2] * h;
		m = f == h & (c | 0) == (d | 0) & (j | 0) == (k | 0) ? 0 : m;
		k = 0;
		w = +g[b + (1 - d << 2) >> 2];
		f = +g[b + (0 - d << 2) >> 2];
		v = +g[b + (~d << 2) >> 2];
		u = +g[b + (-2 - d << 2) >> 2];
		while (1) {
			if ((k | 0) >= (m | 0)) break;
			y = +g[b + (k - d + 2 << 2) >> 2];
			x = +g[l + (k << 2) >> 2];
			x = x * x;
			z = 1.0 - x;
			j = k - c | 0;
			g[a + (k << 2) >> 2] = +g[b + (k << 2) >> 2] + z * s * +g[b + (j << 2) >> 2] + z * t * (+g[b + (j + 1 << 2) >> 2] + +g[b + (j + -1 << 2) >> 2]) + z * n * (+g[b + (j + 2 << 2) >> 2] + +g[b + (j + -2 << 2) >> 2]) + x * p * f + x * q * (w + v) + x * r * (y + u);
			x = w;
			k = k + 1 | 0;
			w = y;
			u = v;
			v = f;
			f = x
		}
		if (!(h == 0.0)) {
			ob(a + (k << 2) | 0, b + (k << 2) | 0, d, e - k | 0, p, q, r);
			i = o;
			return
		}
		if ((b | 0) == (a | 0)) {
			i = o;
			return
		}
		zj(a + (m << 2) | 0, b + (m << 2) | 0, e - m << 2 | 0) | 0;
		i = o;
		return
	}
	function ob(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = +e;
		f = +f;
		h = +h;
		var j = 0.0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0.0,
			q = 0.0;
		o = i;
		k = 0;
		m = +g[b + (1 - c << 2) >> 2];
		l = +g[b + (0 - c << 2) >> 2];
		n = +g[b + (~c << 2) >> 2];
		j = +g[b + (-2 - c << 2) >> 2];
		while (1) {
			if ((k | 0) >= (d | 0)) break;
			q = +g[b + (k - c + 2 << 2) >> 2];
			g[a + (k << 2) >> 2] = +g[b + (k << 2) >> 2] + l * e + (m + n) * f + (q + j) * h;
			p = m;
			k = k + 1 | 0;
			m = q;
			j = n;
			n = l;
			l = p
		}
		i = o;
		return
	}
	function pb(a, e, f, g) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		l = i;
		j = a + 8 | 0;
		k = a + 32 | 0;
		h = (f << 1) + g + -1 | 0;
		a = a + 104 | 0;
		m = 0;
		while (1) {
			n = c[j >> 2] | 0;
			if ((m | 0) >= (n | 0)) break;
			o = m + 1 | 0;
			p = c[k >> 2] | 0;
			n = ($(n, h) | 0) + m | 0;
			c[e + (m << 2) >> 2] = ($($((d[(c[a >> 2] | 0) + n >> 0] | 0) + 64 | 0, g) | 0, (b[p + (o << 1) >> 1] | 0) - (b[p + (m << 1) >> 1] | 0) << f) | 0) >> 2;
			m = o
		}
		i = l;
		return
	}
	function qb() {
		return 248
	}
	function rb(a) {
		a = a | 0;
		var b = 0;
		b = i;
		a = sb(Xc() | 0, a) | 0;
		i = b;
		return a | 0
	}
	function sb(a, b) {
		a = a | 0;
		b = b | 0;
		b = (($((c[a + 4 >> 2] | 0) + 2048 | 0, b) | 0) << 2) + 84 + (b * 96 | 0) | 0;
		return b + (c[a + 8 >> 2] << 5) | 0
	}
	function tb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0;
		e = i;
		d = ub(a, Xc() | 0, d) | 0;
		if (!d) {
			d = mb(b) | 0;
			c[a + 16 >> 2] = d;
			i = e;
			return ((d | 0) == 0 ? -1 : 0) | 0
		} else {
			i = e;
			return d | 0
		}
		return 0
	}
	function ub(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0;
		e = i;
		i = i + 16 | 0;
		if ((d | 0) < 0 | (d | 0) > 2) {
			d = -1;
			i = e;
			return d | 0
		}
		if (!a) {
			d = -7;
			i = e;
			return d | 0
		}
		wj(a | 0, 0, sb(b, d) | 0) | 0;
		c[a >> 2] = b;
		c[a + 4 >> 2] = c[b + 4 >> 2];
		c[a + 8 >> 2] = d;
		c[a + 12 >> 2] = d;
		c[a + 16 >> 2] = 1;
		c[a + 20 >> 2] = 0;
		c[a + 24 >> 2] = c[b + 12 >> 2];
		c[a + 28 >> 2] = 1;
		c[a + 32 >> 2] = 0;
		c[a + 48 >> 2] = 0;
		Cb(a, 4028, e);
		d = 0;
		i = e;
		return d | 0
	}
	function vb(a, d, e, f, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0.0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ka = 0,
			la = 0.0,
			ma = 0.0;
		l = i;
		i = i + 80 | 0;
		A = l + 32 | 0;
		O = l + 24 | 0;
		p = l + 16 | 0;
		M = l + 8 | 0;
		L = l + 4 | 0;
		K = l;
		m = c[a + 8 >> 2] | 0;
		c[M >> 2] = 0;
		c[L >> 2] = 0;
		J = c[a + 12 >> 2] | 0;
		n = c[a >> 2] | 0;
		o = c[n + 8 >> 2] | 0;
		z = c[n + 4 >> 2] | 0;
		V = c[n + 32 >> 2] | 0;
		q = c[a + 20 >> 2] | 0;
		r = c[a + 24 >> 2] | 0;
		s = a + 16 | 0;
		v = $(c[s >> 2] | 0, h) | 0;
		u = $(z + 2072 | 0, m) | 0;
		D = a + (u << 2) + 84 | 0;
		x = o << 1;
		h = u + x | 0;
		B = a + (h << 2) + 84 | 0;
		t = h + x | 0;
		F = a + (t << 2) + 84 | 0;
		y = t + x | 0;
		C = n + 44 | 0;
		w = c[n + 36 >> 2] | 0;
		H = 0;
		while (1) {
			if ((H | 0) > (w | 0)) {
				m = -1;
				P = 85;
				break
			}
			if ((c[C >> 2] << H | 0) == (v | 0)) break;
			H = H + 1 | 0
		}
		if ((P | 0) == 85) {
			i = l;
			return m | 0
		}
		G = 1 << H;
		if ((e | 0) < 0 | (e | 0) > 1275 | (f | 0) == 0) {
			ka = -1;
			i = l;
			return ka | 0
		}
		w = c[C >> 2] << H;
		I = z + 2048 | 0;
		S = 2048 - w | 0;
		E = 0;
		do {
			ka = $(E, I) | 0;
			c[O + (E << 2) >> 2] = a + (ka << 2) + 84;
			c[p + (E << 2) >> 2] = a + (ka + S << 2) + 84;
			E = E + 1 | 0
		} while ((E | 0) < (m | 0));
		N = c[n + 12 >> 2] | 0;
		N = (r | 0) > (N | 0) ? N : r;
		if ((d | 0) == 0 | (e | 0) < 2) {
			wb(a, w, H);
			xb(p, f, w, m, c[s >> 2] | 0, +g[n + 16 >> 2], a + 76 | 0, k);
			ka = (v | 0) / (c[s >> 2] | 0) | 0;
			i = l;
			return ka | 0
		}
		if (!j) kc(A, d, e);
		else A = j;
		I = (J | 0) == 1;
		a: do
		if (I) {
			j = 0;
			while (1) {
				if ((j | 0) >= (o | 0)) break a;
				ka = a + (u + j << 2) + 84 | 0;
				la = +g[ka >> 2];
				R = +g[a + (u + (o + j) << 2) + 84 >> 2];
				g[ka >> 2] = la > R ? la : R;
				j = j + 1 | 0
			}
		}
		while (0);
		d = e << 3;
		E = A + 20 | 0;
		Q = c[E >> 2] | 0;
		j = A + 28 | 0;
		T = c[j >> 2] | 0;
		W = yb(Q, T) | 0;
		if ((W | 0) < (d | 0)) if ((W | 0) == 1) {
			U = rc(A, 15) | 0;
			if (!U) {
				U = 0;
				W = 1
			} else {
				Q = c[E >> 2] | 0;
				T = c[j >> 2] | 0;
				P = 19
			}
		} else U = 0;
		else {
			U = 1;
			P = 19
		}
		if ((P | 0) == 19) {
			c[E >> 2] = Q + (d - (yb(Q, T) | 0));
			W = d
		}
		if ((q | 0) == 0 ? (W + 16 | 0) <= (d | 0) : 0) {
			if (!(rc(A, 1) | 0)) {
				R = 0.0;
				Q = 0;
				T = 0
			} else {
				Q = tc(A, 6) | 0;
				Q = (16 << Q) + (uc(A, Q + 4 | 0) | 0) + -1 | 0;
				P = uc(A, 3) | 0;
				if (((yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0) + 2 | 0) > (d | 0)) T = 0;
				else T = sc(A, 272, 2) | 0;
				R = +(P + 1 | 0) * .09375
			}
			P = yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0
		} else {
			Q = 0;
			R = 0.0;
			T = 0;
			P = W
		}
		if ((H | 0) > 0 ? (P + 3 | 0) <= (d | 0) : 0) {
			W = rc(A, 3) | 0;
			P = yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0;
			X = (W | 0) == 0;
			W = X ? 0 : W;
			X = X ? 0 : G
		} else {
			W = 0;
			X = 0
		}
		if ((P + 3 | 0) > (d | 0)) P = 0;
		else P = rc(A, 3) | 0;
		od(n, q, r, D, P, A, J, H);
		P = ta() | 0;
		Y = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		zb(q, r, W, Y, H, A);
		if (((yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0) + 4 | 0) > (d | 0)) Z = 2;
		else Z = sc(A, 280, 5) | 0;
		aa = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		pb(n, aa, H, J);
		_ = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		da = 6;
		ca = q;
		ea = jc(A) | 0;
		fa = e << 6;
		while (1) {
			if ((ca | 0) >= (r | 0)) break;
			ba = ca + 1 | 0;
			ha = ($(J, (b[V + (ba << 1) >> 1] | 0) - (b[V + (ca << 1) >> 1] | 0) | 0) | 0) << H;
			ia = ha << 3;
			ga = (ha | 0) < 48;
			if ((ia | 0) >= ((ga ? 48 : ha) | 0)) ia = ga ? 48 : ha;
			ka = aa + (ca << 2) | 0;
			ga = 0;
			ha = da;
			while (1) {
				if ((ea + (ha << 3) | 0) >= (fa | 0)) break;
				if ((ga | 0) >= (c[ka >> 2] | 0)) break;
				ha = rc(A, ha) | 0;
				ea = jc(A) | 0;
				if (!ha) break;
				ga = ga + ia | 0;
				ha = 1;
				fa = fa - ia | 0
			}
			c[_ + (ca << 2) >> 2] = ga;
			if ((ga | 0) <= 0) {
				ca = ba;
				continue
			}
			da = (da | 0) < 3 ? 2 : da + -1 | 0;
			ca = ba
		}
		V = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		if ((ea + 48 | 0) > (fa | 0)) fa = 5;
		else fa = sc(A, 288, 7) | 0;
		ca = e << 6;
		da = ca - (jc(A) | 0) + -1 | 0;
		e = (W | 0) == 0;
		if ((e ^ 1) & (H | 0) > 1) ba = (da | 0) >= ((H << 3) + 16 | 0) ? 8 : 0;
		else ba = 0;
		ka = da - ba | 0;
		ea = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		da = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		_ = sd(n, q, r, _, aa, fa, M, L, ka, K, ea, V, da, J, H, A, 0, 0, 0) | 0;
		pd(n, q, r, D, V, A, J);
		aa = S + ((z | 0) / 2 | 0) << 2;
		S = 0;
		do {
			ka = c[O + (S << 2) >> 2] | 0;
			zj(ka | 0, ka + (w << 2) | 0, aa | 0) | 0;
			S = S + 1 | 0
		} while ((S | 0) < (m | 0));
		S = $(J, o) | 0;
		fa = i;
		i = i + ((1 * S | 0) + 15 & -16) | 0;
		ka = $(J, w) | 0;
		aa = i;
		i = i + ((4 * ka | 0) + 15 & -16) | 0;
		if ((J | 0) == 2) ga = aa + (w << 2) | 0;
		else ga = 0;
		O = a + 36 | 0;
		ha = a + 32 | 0;
		Va(0, n, q, r, aa, ga, fa, 0, ea, X, Z, c[L >> 2] | 0, c[M >> 2] | 0, Y, ca - ba | 0, c[K >> 2] | 0, A, H, _, O, c[ha >> 2] | 0);
		if (ba) {
			ka = (uc(A, 1) | 0) == 0;
			qd(n, q, r, D, V, da, d - (yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0) | 0, A, J);
			if (!ka) Ra(n, aa, fa, H, J, w, q, r, D, B, F, ea, c[O >> 2] | 0, c[ha >> 2] | 0)
		} else qd(n, q, r, D, V, da, d - (yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0) | 0, A, J);
		b: do
		if (U) {
			K = 0;
			while (1) {
				if ((K | 0) >= (S | 0)) break b;
				g[a + (u + K << 2) + 84 >> 2] = -28.0;
				K = K + 1 | 0
			}
		}
		while (0);
		Ab(n, aa, p, D, q, N, J, m, W, H, c[s >> 2] | 0, U);
		K = a + 52 | 0;
		S = a + 56 | 0;
		M = a + 64 | 0;
		L = a + 60 | 0;
		U = a + 72 | 0;
		N = a + 68 | 0;
		J = n + 60 | 0;
		H = (H | 0) == 0;
		V = 0;
		do {
			ka = c[K >> 2] | 0;
			ka = (ka | 0) > 15 ? ka : 15;
			c[K >> 2] = ka;
			ia = c[S >> 2] | 0;
			ia = (ia | 0) > 15 ? ia : 15;
			c[S >> 2] = ia;
			W = c[p + (V << 2) >> 2] | 0;
			nb(W, W, ia, ka, c[C >> 2] | 0, +g[M >> 2], +g[L >> 2], c[U >> 2] | 0, c[N >> 2] | 0, c[J >> 2] | 0, z);
			if (!H) {
				ka = c[C >> 2] | 0;
				ia = W + (ka << 2) | 0;
				nb(ia, ia, c[K >> 2] | 0, Q, w - ka | 0, +g[L >> 2], R, c[N >> 2] | 0, T, c[J >> 2] | 0, z)
			}
			V = V + 1 | 0
		} while ((V | 0) < (m | 0));
		c[S >> 2] = c[K >> 2];
		g[M >> 2] = +g[L >> 2];
		c[U >> 2] = c[N >> 2];
		c[K >> 2] = Q;
		g[L >> 2] = R;
		c[N >> 2] = T;
		if (!H) {
			c[S >> 2] = Q;
			g[M >> 2] = R;
			c[U >> 2] = T
		}
		if (I) yj(a + (u + o << 2) + 84 | 0, D | 0, o << 2 | 0) | 0;
		c: do
		if (e) {
			z = o << 3;
			yj(F | 0, B | 0, z | 0) | 0;
			yj(B | 0, D | 0, z | 0) | 0;
			R = +(G | 0) * .0010000000474974513;
			z = 0;
			while (1) {
				if ((z | 0) >= (x | 0)) {
					x = 0;
					break c
				}
				ka = a + (y + z << 2) + 84 | 0;
				ma = +g[ka >> 2] + R;
				la = +g[a + (u + z << 2) + 84 >> 2];
				g[ka >> 2] = ma < la ? ma : la;
				z = z + 1 | 0
			}
		} else {
			y = 0;
			while (1) {
				if ((y | 0) >= (x | 0)) {
					x = 0;
					break c
				}
				ka = a + (h + y << 2) + 84 | 0;
				la = +g[ka >> 2];
				ma = +g[a + (u + y << 2) + 84 >> 2];
				g[ka >> 2] = la < ma ? la : ma;
				y = y + 1 | 0
			}
		}
		while (0);
		do {
			y = $(x, o) | 0;
			z = 0;
			while (1) {
				if ((z | 0) >= (q | 0)) {
					z = r;
					break
				}
				ka = y + z | 0;
				g[a + (u + ka << 2) + 84 >> 2] = 0.0;
				g[a + (t + ka << 2) + 84 >> 2] = -28.0;
				g[a + (h + ka << 2) + 84 >> 2] = -28.0;
				z = z + 1 | 0
			}
			while (1) {
				if ((z | 0) >= (o | 0)) break;
				ka = y + z | 0;
				g[a + (u + ka << 2) + 84 >> 2] = 0.0;
				g[a + (t + ka << 2) + 84 >> 2] = -28.0;
				g[a + (h + ka << 2) + 84 >> 2] = -28.0;
				z = z + 1 | 0
			}
			x = x + 1 | 0
		} while ((x | 0) < 2);
		c[O >> 2] = c[j >> 2];
		xb(p, f, w, m, c[s >> 2] | 0, +g[n + 16 >> 2], a + 76 | 0, k);
		c[a + 48 >> 2] = 0;
		if ((yb(c[E >> 2] | 0, c[j >> 2] | 0) | 0) > (d | 0)) m = -3;
		else {
			if (Bb(c[A + 44 >> 2] | 0) | 0) c[a + 40 >> 2] = 1;
			m = (v | 0) / (c[s >> 2] | 0) | 0
		}
		ja(P | 0);
		ka = m;
		i = l;
		return ka | 0
	}
	function wb(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0.0,
			Q = 0.0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0.0,
			W = 0.0;
		j = i;
		i = i + 4416 | 0;
		f = j + 4400 | 0;
		t = j + 4392 | 0;
		q = j + 296 | 0;
		r = j + 192 | 0;
		p = j + 96 | 0;
		o = j;
		h = c[a + 8 >> 2] | 0;
		y = c[a >> 2] | 0;
		x = c[y + 8 >> 2] | 0;
		n = c[y + 4 >> 2] | 0;
		u = c[y + 32 >> 2] | 0;
		l = n + 2048 | 0;
		m = 2048 - d | 0;
		k = 0;
		do {
			U = $(k, l) | 0;
			c[f + (k << 2) >> 2] = a + (U << 2) + 84;
			c[t + (k << 2) >> 2] = a + (U + m << 2) + 84;
			k = k + 1 | 0
		} while ((k | 0) < (h | 0));
		s = $(l, h) | 0;
		z = $(h, n + 2072 | 0) | 0;
		B = x << 1;
		B = z + B + B + B | 0;
		k = a + 48 | 0;
		l = c[k >> 2] | 0;
		w = c[a + 20 >> 2] | 0;
		A = (l | 0) > 4;
		if (!((A ^ 1) & (w | 0) == 0)) {
			r = c[a + 24 >> 2] | 0;
			p = c[y + 12 >> 2] | 0;
			o = (r | 0) < (p | 0);
			if ((w | 0) > ((o ? r : p) | 0)) p = w;
			else p = o ? r : p;
			U = $(h, d) | 0;
			o = ta() | 0;
			q = i;
			i = i + ((4 * U | 0) + 15 & -16) | 0;
			if (A) z = B;
			else {
				v = (l | 0) == 0 ? 1.5 : .5;
				A = 0;
				do {
					B = $(A, x) | 0;
					s = w;
					while (1) {
						if ((s | 0) >= (r | 0)) break;
						U = a + (z + (B + s) << 2) + 84 | 0;
						g[U >> 2] = +g[U >> 2] - v;
						s = s + 1 | 0
					}
					A = A + 1 | 0
				} while ((A | 0) < (h | 0))
			}
			r = a + (z << 2) + 84 | 0;
			A = a + 36 | 0;
			z = a + 32 | 0;
			E = c[A >> 2] | 0;
			x = 0;
			while (1) {
				if ((x | 0) >= (h | 0)) break;
				s = $(x, d) | 0;
				D = w;
				while (1) {
					if ((D | 0) >= (p | 0)) break;
					C = b[u + (D << 1) >> 1] | 0;
					B = s + (C << e) | 0;
					D = D + 1 | 0;
					C = (b[u + (D << 1) >> 1] | 0) - C << e;
					F = 0;
					while (1) {
						if ((F | 0) >= (C | 0)) break;
						U = Ma(E) | 0;
						g[q + (B + F << 2) >> 2] = +(U >> 20 | 0);
						E = U;
						F = F + 1 | 0
					}
					Ad(q + (B << 2) | 0, C, 1.0, c[z >> 2] | 0)
				}
				x = x + 1 | 0
			}
			c[A >> 2] = E;
			m = m + (n >>> 1) << 2;
			n = 0;
			do {
				U = c[f + (n << 2) >> 2] | 0;
				zj(U | 0, U + (d << 2) | 0, m | 0) | 0;
				n = n + 1 | 0
			} while ((n | 0) < (h | 0));
			Ab(y, q, t, r, w, p, h, h, 0, e, c[a + 16 >> 2] | 0, 0);
			ja(o | 0);
			U = l + 1 | 0;
			c[k >> 2] = U;
			i = j;
			return
		}
		u = (l | 0) == 0;
		if (u) {
			e = a + 32 | 0;
			w = Db(f, h, c[e >> 2] | 0) | 0;
			c[a + 44 >> 2] = w;
			v = 1.0
		} else {
			e = a + 32 | 0;
			v = .800000011920929;
			w = c[a + 44 >> 2] | 0
		}
		t = ta() | 0;
		x = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		B = c[y + 60 >> 2] | 0;
		J = w << 1;
		L = (J | 0) < 1024;
		K = m << 2;
		A = 1024 - w | 0;
		F = n + d | 0;
		I = 1024 - d + A | 0;
		z = m + -1 | 0;
		H = a + 52 | 0;
		E = a + 60 | 0;
		G = a + 68 | 0;
		C = (n | 0) / 2 | 0;
		y = n + -1 | 0;
		D = 0;
		do {
			M = c[f + (D << 2) >> 2] | 0;
			N = 0;
			while (1) {
				if ((N | 0) >= 1024) break;
				g[q + (N << 2) >> 2] = +g[M + (N + 1024 << 2) >> 2];
				N = N + 1 | 0
			}
			if (u) {
				ec(q, r, B, n, 24, 1024, c[e >> 2] | 0);
				g[r >> 2] = +g[r >> 2] * 1.000100016593933;
				N = 1;
				while (1) {
					if ((N | 0) >= 25) break;
					U = r + (N << 2) | 0;
					Q = +g[U >> 2];
					V = +(N | 0);
					g[U >> 2] = Q - Q * 6400000711437315.0e-20 * V * V;
					N = N + 1 | 0
				}
				ac(a + (s + (D * 24 | 0) << 2) + 84 | 0, r, 24)
			}
			T = L ? J : 1024;
			N = 2048 - T + -1 | 0;
			R = 0;
			while (1) {
				if ((R | 0) >= 24) break;
				g[p + (R << 2) >> 2] = +g[M + (N - R << 2) >> 2];
				R = R + 1 | 0
			}
			R = q + (1024 - T << 2) | 0;
			N = a + (s + (D * 24 | 0) << 2) + 84 | 0;
			bc(R, N, R, T, p, c[e >> 2] | 0);
			R = T >> 1;
			S = 1024 - R | 0;
			T = 1024 - T | 0;
			Q = 1.0;
			O = 1.0;
			U = 0;
			while (1) {
				if ((U | 0) >= (R | 0)) break;
				W = +g[q + (S + U << 2) >> 2];
				V = +g[q + (T + U << 2) >> 2];
				Q = Q + W * W;
				O = O + V * V;
				U = U + 1 | 0
			}
			Q = +P(+((Q < O ? Q : O) / O));
			zj(M | 0, M + (d << 2) | 0, K | 0) | 0;
			O = 0.0;
			V = v * Q;
			R = 0;
			S = 0;
			while (1) {
				if ((R | 0) >= (F | 0)) {
					R = 0;
					break
				}
				if ((S | 0) >= (w | 0)) {
					V = V * Q;
					S = S - w | 0
				}
				g[M + (m + R << 2) >> 2] = V * +g[q + (A + S << 2) >> 2];
				W = +g[M + (I + S << 2) >> 2];
				O = O + W * W;
				R = R + 1 | 0;
				S = S + 1 | 0
			}
			while (1) {
				if ((R | 0) >= 24) break;
				g[o + (R << 2) >> 2] = +g[M + (z - R << 2) >> 2];
				R = R + 1 | 0
			}
			U = M + (m << 2) | 0;
			dc(U, N, U, F, o, c[e >> 2] | 0);
			Q = 0.0;
			N = 0;
			while (1) {
				if ((N | 0) >= (F | 0)) break;
				W = +g[M + (m + N << 2) >> 2];
				Q = Q + W * W;
				N = N + 1 | 0
			}
			a: do
			if (O > Q * .20000000298023224) {
				if (O < Q) {
					O = +P(+((O + 1.0) / (Q + 1.0)));
					Q = 1.0 - O;
					N = 0;
					while (1) {
						if ((N | 0) >= (n | 0)) {
							N = n;
							break
						}
						U = M + (m + N << 2) | 0;
						g[U >> 2] = (1.0 - +g[B + (N << 2) >> 2] * Q) * +g[U >> 2];
						N = N + 1 | 0
					}
					while (1) {
						if ((N | 0) >= (F | 0)) break a;
						U = M + (m + N << 2) | 0;
						g[U >> 2] = O * +g[U >> 2];
						N = N + 1 | 0
					}
				}
			} else {
				N = 0;
				while (1) {
					if ((N | 0) >= (F | 0)) break a;
					g[M + (m + N << 2) >> 2] = 0.0;
					N = N + 1 | 0
				}
			}
			while (0);
			U = c[H >> 2] | 0;
			W = -+g[E >> 2];
			N = c[G >> 2] | 0;
			nb(x, M + 8192 | 0, U, U, n, W, W, N, N, 0, 0);
			N = 0;
			while (1) {
				if ((N | 0) >= (C | 0)) break;
				g[M + (N + 2048 << 2) >> 2] = +g[B + (N << 2) >> 2] * +g[x + (y - N << 2) >> 2] + +g[B + (n - N + -1 << 2) >> 2] * +g[x + (N << 2) >> 2];
				N = N + 1 | 0
			}
			D = D + 1 | 0
		}
		while ((D | 0) < (h | 0));
		ja(t | 0);
		U = l + 1 | 0;
		c[k >> 2] = U;
		i = j;
		return
	}
	function xb(a, b, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = +h;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0,
			v = 0.0;
		k = i;
		n = i;
		i = i + ((4 * d | 0) + 15 & -16) | 0;
		l = (d | 0) / (f | 0) | 0;
		m = (f | 0) > 1;
		s = 0;
		o = 0;
		do {
			q = j + (o << 2) | 0;
			t = +g[q >> 2];
			r = c[a + (o << 2) >> 2] | 0;
			if (!m) {
				u = 0;
				while (1) {
					if ((u | 0) >= (d | 0)) break;
					v = +g[r + (u << 2) >> 2] + t + 1.0000000031710769e-30;
					g[b + (o + ($(u, e) | 0) << 2) >> 2] = v * 30517578125.0e-15;
					t = v * h;
					u = u + 1 | 0
				}
				g[q >> 2] = t;
				if (s) p = 9
			} else {
				p = 0;
				while (1) {
					if ((p | 0) >= (d | 0)) break;
					v = +g[r + (p << 2) >> 2] + t + 1.0000000031710769e-30;
					g[n + (p << 2) >> 2] = v;
					t = v * h;
					p = p + 1 | 0
				}
				g[q >> 2] = t;
				s = 1;
				p = 9
			}
			a: do
			if ((p | 0) == 9) {
				p = 0;
				q = 0;
				while (1) {
					if ((q | 0) >= (l | 0)) break a;
					g[b + (o + ($(q, e) | 0) << 2) >> 2] = +g[n + (($(q, f) | 0) << 2) >> 2] * 30517578125.0e-15;
					q = q + 1 | 0
				}
			}
			while (0);
			o = o + 1 | 0
		}
		while ((o | 0) < (e | 0));
		i = k;
		return
	}
	function yb(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function zb(b, d, e, f, g, h) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		j = i;
		n = c[h + 4 >> 2] << 3;
		l = h + 20 | 0;
		m = h + 28 | 0;
		s = yb(c[l >> 2] | 0, c[m >> 2] | 0) | 0;
		o = (e | 0) != 0;
		r = o ? 2 : 4;
		if ((g | 0) > 0) k = (s + r + 1 | 0) >>> 0 <= n >>> 0;
		else k = 0;
		n = n - (k & 1) | 0;
		o = o ? 4 : 5;
		q = 0;
		p = b;
		t = s;
		s = 0;
		while (1) {
			if ((p | 0) >= (d | 0)) break;
			if ((t + r | 0) >>> 0 <= n >>> 0) {
				r = q ^ (rc(h, r) | 0);
				q = r;
				t = yb(c[l >> 2] | 0, c[m >> 2] | 0) | 0;
				s = s | r
			}
			c[f + (p << 2) >> 2] = q;
			r = o;
			p = p + 1 | 0
		}
		l = e << 2;
		if (k ? (a[l + s + (216 + (g << 3)) >> 0] | 0) != (a[(l | 2) + s + (216 + (g << 3)) >> 0] | 0) : 0) h = (rc(h, 1) | 0) << 1;
		else h = 0;
		h = l + h | 0;
		while (1) {
			if ((b | 0) >= (d | 0)) break;
			t = f + (b << 2) | 0;
			c[t >> 2] = a[h + (c[t >> 2] | 0) + (216 + (g << 3)) >> 0];
			b = b + 1 | 0
		}
		i = j;
		return
	}
	function Ab(a, b, d, e, f, h, j, k, l, m, n, o) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0;
		p = i;
		r = c[a + 4 >> 2] | 0;
		u = c[a + 8 >> 2] | 0;
		s = c[a + 44 >> 2] | 0;
		t = s << m;
		q = i;
		i = i + ((4 * t | 0) + 15 & -16) | 0;
		v = 1 << m;
		y = (l | 0) == 0;
		z = c[a + 36 >> 2] | 0;
		l = y ? t : s;
		s = y ? 1 : v;
		m = y ? z - m | 0 : z;
		if ((k | 0) == 2) {
			if ((j | 0) == 1) {
				Qa(a, b, q, e, f, h, v, n, o);
				u = d + 4 | 0;
				e = c[u >> 2] | 0;
				b = (r | 0) / 2 | 0;
				yj(e + (b << 2) | 0, q | 0, t << 2 | 0) | 0;
				t = a + 64 | 0;
				a = a + 60 | 0;
				v = 0;
				while (1) {
					if ((v | 0) >= (s | 0)) {
						d = 0;
						break
					}
					z = (c[d >> 2] | 0) + (($(l, v) | 0) << 2) | 0;
					Wc(t, e + (b + v << 2) | 0, z, c[a >> 2] | 0, r, m, s);
					v = v + 1 | 0
				}
				while (1) {
					if ((d | 0) >= (s | 0)) break;
					z = (c[u >> 2] | 0) + (($(l, d) | 0) << 2) | 0;
					Wc(t, q + (d << 2) | 0, z, c[a >> 2] | 0, r, m, s);
					d = d + 1 | 0
				}
				i = p;
				return
			}
		} else if ((k | 0) == 1 & (j | 0) == 2) {
			k = c[d >> 2] | 0;
			j = (r | 0) / 2 | 0;
			Qa(a, b, q, e, f, h, v, n, o);
			Qa(a, b + (t << 2) | 0, k + (j << 2) | 0, e + (u << 2) | 0, f, h, v, n, o);
			u = 0;
			while (1) {
				if ((u | 0) >= (t | 0)) break;
				z = q + (u << 2) | 0;
				g[z >> 2] = (+g[z >> 2] + +g[k + (j + u << 2) >> 2]) * .5;
				u = u + 1 | 0
			}
			t = a + 64 | 0;
			u = a + 60 | 0;
			a = 0;
			while (1) {
				if ((a | 0) >= (s | 0)) break;
				z = (c[d >> 2] | 0) + (($(l, a) | 0) << 2) | 0;
				Wc(t, q + (a << 2) | 0, z, c[u >> 2] | 0, r, m, s);
				a = a + 1 | 0
			}
			i = p;
			return
		}
		y = a + 64 | 0;
		z = a + 60 | 0;
		x = 0;
		do {
			Qa(a, b + (($(x, t) | 0) << 2) | 0, q, e + (($(x, u) | 0) << 2) | 0, f, h, v, n, o);
			j = d + (x << 2) | 0;
			w = 0;
			while (1) {
				if ((w | 0) >= (s | 0)) break;
				A = (c[j >> 2] | 0) + (($(l, w) | 0) << 2) | 0;
				Wc(y, q + (w << 2) | 0, A, c[z >> 2] | 0, r, m, s);
				w = w + 1 | 0
			}
			x = x + 1 | 0
		} while ((x | 0) < (k | 0));
		i = p;
		return
	}
	function Bb(a) {
		a = a | 0;
		return a | 0
	}
	function Cb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0;
		e = i;
		i = i + 16 | 0;
		f = e;
		c[f >> 2] = d;
		a: do
		switch (b | 0) {
		case 10008:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if ((b | 0) < 1 | (b | 0) > 2) a = 25;
				else {
					c[a + 12 >> 2] = b;
					a = 24
				}
				break
			};
		case 10016:
			{
				d = c[f >> 2] | 0;
				h = c[d >> 2] | 0;
				c[f >> 2] = d + 4;
				c[a + 28 >> 2] = h;
				a = 24;
				break
			};
		case 4027:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if (!b) a = 25;
				else {
					c[b >> 2] = (c[a + 4 >> 2] | 0) / (c[a + 16 >> 2] | 0) | 0;
					a = 24
				}
				break
			};
		case 10007:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if (!b) a = 25;
				else {
					a = a + 40 | 0;
					c[b >> 2] = c[a >> 2];
					c[a >> 2] = 0;
					a = 24
				}
				break
			};
		case 10012:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if ((b | 0) >= 1 ? (b | 0) <= (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
					c[a + 24 >> 2] = b;
					a = 24
				} else a = 25;
				break
			};
		case 4033:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if (!b) a = 25;
				else {
					c[b >> 2] = c[a + 52 >> 2];
					a = 24
				}
				break
			};
		case 10015:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if (!b) a = 25;
				else {
					c[b >> 2] = c[a >> 2];
					a = 24
				}
				break
			};
		case 10010:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if ((b | 0) >= 0 ? (b | 0) < (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
					c[a + 20 >> 2] = b;
					a = 24
				} else a = 25;
				break
			};
		case 4031:
			{
				h = c[f >> 2] | 0;
				b = c[h >> 2] | 0;
				c[f >> 2] = h + 4;
				if (!b) a = 25;
				else {
					c[b >> 2] = c[a + 36 >> 2];
					a = 24
				}
				break
			};
		case 4028:
			{
				f = c[a + 8 >> 2] | 0;
				b = $((c[a + 4 >> 2] | 0) + 2072 | 0, f) | 0;
				j = c[a >> 2] | 0;
				h = c[j + 8 >> 2] | 0;
				d = h << 1;
				b = b + d | 0;
				d = b + d | 0;
				wj(a + 36 | 0, 0, (sb(j, f) | 0) + -36 | 0) | 0;
				f = 0;
				while (1) {
					if ((f | 0) >= (h << 1 | 0)) {
						a = 24;
						break a
					}
					g[a + (d + f << 2) + 84 >> 2] = -28.0;
					g[a + (b + f << 2) + 84 >> 2] = -28.0;
					h = c[(c[a >> 2] | 0) + 8 >> 2] | 0;
					f = f + 1 | 0
				}
			};
		default:
			{
				i = e;
				return
			}
		}
		while (0);
		if ((a | 0) == 24) {
			i = e;
			return
		} else if ((a | 0) == 25) {
			i = e;
			return
		}
	}
	function Db(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		f = i;
		i = i + 4112 | 0;
		e = f + 4096 | 0;
		g = f;
		Yc(a, g, 2048, b, d);
		bd(g + 1440 | 0, g, 1328, 620, e, d);
		i = f;
		return 720 - (c[e >> 2] | 0) | 0
	}
	function Eb(a) {
		a = a | 0;
		var b = 0;
		b = i;
		a = Fb(Xc() | 0, a) | 0;
		i = b;
		return a | 0
	}
	function Fb(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0;
		d = (($(c[a + 4 >> 2] | 0, b) | 0) << 2) + 200 + (b << 12) | 0;
		b = d + (($(b * 3 | 0, c[a + 8 >> 2] | 0) | 0) << 2) | 0;
		return b | 0
	}
	function Gb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		f = i;
		e = Hb(a, Xc() | 0, d, e) | 0;
		if (e) {
			d = e;
			i = f;
			return d | 0
		}
		c[a + 28 >> 2] = mb(b) | 0;
		d = 0;
		i = f;
		return d | 0
	}
	function Hb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		f = i;
		i = i + 16 | 0;
		if ((d | 0) < 0 | (d | 0) > 2) {
			e = -1;
			i = f;
			return e | 0
		}
		if ((a | 0) == 0 | (b | 0) == 0) {
			e = -7;
			i = f;
			return e | 0
		}
		wj(a | 0, 0, Fb(b, d) | 0) | 0;
		c[a >> 2] = b;
		c[a + 4 >> 2] = d;
		c[a + 8 >> 2] = d;
		c[a + 28 >> 2] = 1;
		c[a + 32 >> 2] = 0;
		c[a + 36 >> 2] = c[b + 12 >> 2];
		c[a + 48 >> 2] = 1;
		c[a + 72 >> 2] = e;
		c[a + 52 >> 2] = 1;
		c[a + 16 >> 2] = 1;
		c[a + 40 >> 2] = -1;
		c[a + 44 >> 2] = 0;
		c[a + 12 >> 2] = 0;
		c[a + 24 >> 2] = 5;
		c[a + 60 >> 2] = 24;
		Xb(a, 4028, f) | 0;
		e = 0;
		i = f;
		return e | 0
	}
	function Ib(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0.0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0;
		h = i;
		i = i + 112 | 0;
		f = h;
		j = +g[b >> 2];
		a: do
		if ((e | 0) == 1) {
			g[f >> 2] = j;
			c = 1;
			while (1) {
				if ((c | 0) >= (d | 0)) break a;
				m = j + -1.0;
				l = +g[b + (c << 2) >> 2];
				l = m > l ? m : l;
				g[f + (c << 2) >> 2] = l;
				j = l;
				c = c + 1 | 0
			}
		} else {
			m = +g[b + (c << 2) >> 2];
			j = j > m ? j : m;
			g[f >> 2] = j;
			k = 1;
			while (1) {
				if ((k | 0) >= (d | 0)) break a;
				n = j + -1.0;
				l = +g[b + (k << 2) >> 2];
				m = +g[b + (k + c << 2) >> 2];
				p = l > m;
				o = n > (p ? l : m);
				m = o | p ? o ? n : l : m;
				g[f + (k << 2) >> 2] = m;
				j = m;
				k = k + 1 | 0
			}
		}
		while (0);
		b = d + -2 | 0;
		while (1) {
			if ((b | 0) <= -1) break;
			p = f + (b << 2) | 0;
			m = +g[p >> 2];
			n = +g[f + (b + 1 << 2) >> 2] + -1.0;
			g[p >> 2] = m > n ? m : n;
			b = b + -1 | 0
		}
		b = d + -1 | 0;
		c = 0;
		j = 0.0;
		k = 2;
		b: while (1) {
			while (1) {
				if ((k | 0) < (b | 0)) break;
				c = c + 1 | 0;
				if ((c | 0) < (e | 0)) k = 2;
				else break b
			}
			m = +g[a + (k << 2) >> 2];
			n = +g[f + (k << 2) >> 2];
			n = (m < 0.0 ? 0.0 : m) - (n < 0.0 ? 0.0 : n);
			j = j + (n < 0.0 ? 0.0 : n);
			k = k + 1 | 0
		}
		p = j / +($(d + -3 | 0, e) | 0) > 1.0 & 1;
		i = h;
		return p | 0
	}
	function Jb(a, b, c, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0.0,
			m = 0.0,
			n = 0,
			o = 0.0;
		k = i;
		l = +g[f >> 2];
		m = +g[h >> 2];
		do
		if (!(+g[f + 4 >> 2] == 0.0)) {
			f = (c | 0) / (e | 0) | 0;
			if ((e | 0) != 1) n = 9
		} else {
			if ((e | 0) != 1) {
				f = (c | 0) / (e | 0) | 0;
				n = 9;
				break
			}
			if (!j) e = 0;
			else {
				f = (c | 0) / (e | 0) | 0;
				break
			}
			while (1) {
				if ((e | 0) >= (c | 0)) break;
				o = +g[a + (($(e, d) | 0) << 2) >> 2] * 32768.0;
				g[b + (e << 2) >> 2] = o - m;
				m = l * o;
				e = e + 1 | 0
			}
			g[h >> 2] = m;
			i = k;
			return
		}
		while (0);
		if ((n | 0) == 9) wj(b | 0, 0, c << 2 | 0) | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (f | 0)) break;
			g[b + (($(n, e) | 0) << 2) >> 2] = +g[a + (($(n, d) | 0) << 2) >> 2] * 32768.0;
			n = n + 1 | 0
		}
		a: do
		if (!j) e = 0;
		else {
			d = 0;
			while (1) {
				if ((d | 0) >= (f | 0)) {
					e = 0;
					break a
				}
				a = b + (($(d, e) | 0) << 2) | 0;
				o = +g[a >> 2];
				if (!(o > 65536.0)) {
					if (o < -65536.0) o = -65536.0
				} else o = 65536.0;
				g[a >> 2] = o;
				d = d + 1 | 0
			}
		}
		while (0);
		while (1) {
			if ((e | 0) >= (c | 0)) break;
			n = b + (e << 2) | 0;
			o = +g[n >> 2];
			g[n >> 2] = o - m;
			m = l * o;
			e = e + 1 | 0
		}
		g[h >> 2] = m;
		i = k;
		return
	}
	function Kb(a, d, e, f, h, j) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0.0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0.0,
			oa = 0.0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ua = 0.0,
			va = 0,
			wa = 0,
			xa = 0.0,
			ya = 0,
			za = 0,
			Aa = 0,
			Ba = 0,
			Ca = 0,
			Da = 0.0,
			Ea = 0.0,
			Fa = 0;
		k = i;
		i = i + 96 | 0;
		C = k + 40 | 0;
		V = k + 32 | 0;
		s = k + 28 | 0;
		P = k + 24 | 0;
		v = k + 20 | 0;
		t = k + 16 | 0;
		U = k + 12 | 0;
		F = k + 8 | 0;
		G = k + 4 | 0;
		N = k;
		o = c[a + 4 >> 2] | 0;
		r = c[a + 8 >> 2] | 0;
		c[s >> 2] = 15;
		g[P >> 2] = 0.0;
		c[v >> 2] = 0;
		c[U >> 2] = 0;
		u = c[a >> 2] | 0;
		n = c[u + 8 >> 2] | 0;
		M = c[u + 4 >> 2] | 0;
		L = c[u + 32 >> 2] | 0;
		l = c[a + 32 >> 2] | 0;
		m = c[a + 36 >> 2] | 0;
		g[F >> 2] = 0.0;
		if ((h | 0) < 2 | (d | 0) == 0) {
			Ca = -1;
			i = k;
			return Ca | 0
		}
		W = a + 28 | 0;
		O = $(c[W >> 2] | 0, e) | 0;
		e = u + 44 | 0;
		I = u + 36 | 0;
		p = c[I >> 2] | 0;
		x = 0;
		while (1) {
			if ((x | 0) > (p | 0)) {
				a = -1;
				X = 217;
				break
			}
			if ((c[e >> 2] << x | 0) == (O | 0)) break;
			x = x + 1 | 0
		}
		if ((X | 0) == 217) {
			i = k;
			return a | 0
		}
		T = 1 << x;
		B = c[e >> 2] << x;
		Q = a + (($(o, M) | 0) << 2) + 200 | 0;
		p = M + 1024 | 0;
		e = $(o, p) | 0;
		y = a + (e << 2) + 200 | 0;
		w = $(o, n) | 0;
		p = p + n | 0;
		q = $(o, p) | 0;
		z = a + (q << 2) + 200 | 0;
		p = $(o, p + n | 0) | 0;
		A = a + (p << 2) + 200 | 0;
		Z = (j | 0) == 0;
		if (Z) {
			E = 0;
			R = 1
		} else {
			R = Lb(c[j + 20 >> 2] | 0, c[j + 28 >> 2] | 0) | 0;
			E = R + 4 >> 3
		}
		J = (h | 0) < 1275 ? h : 1275;
		Y = J - E | 0;
		S = a + 44 | 0;
		h = c[a + 40 >> 2] | 0;
		if (c[S >> 2] | 0) if ((h | 0) == -1) {
			h = -1;
			X = 11
		} else {
			X = c[u >> 2] | 0;
			X = (($(h, O) | 0) + (X >> 4) | 0) / (X >> 3 | 0) | 0;
			O = J;
			_ = X >> 6;
			J = X;
			X = 15
		} else X = 11;
		if ((X | 0) == 11) {
			O = $(h, O) | 0;
			if ((h | 0) != -1) {
				aa = c[u >> 2] | 0;
				aa = (((aa << 2) + ((R | 0) > 1 ? O + R | 0 : O) | 0) / (aa << 3 | 0) | 0) - ((c[a + 48 >> 2] | 0) != 0 & 1) | 0;
				_ = (J | 0) < (aa | 0);
				if (((_ ? J : aa) | 0) < 2) {
					O = 2;
					_ = 2
				} else {
					O = _ ? J : aa;
					_ = _ ? J : aa
				}
				if ((h | 0) == -1) {
					h = 51e4;
					J = 0
				} else {
					J = 0;
					X = 15
				}
			} else {
				O = J;
				h = 51e4;
				_ = J;
				J = 0
			}
		}
		if ((X | 0) == 15) h = h - ($((r * 40 | 0) + 20 | 0, (400 >>> x) + -50 | 0) | 0) | 0;
		if (Z) wc(C, f, O);
		else C = j;
		j = (J | 0) > 0;
		if (((j ? (c[a + 52 >> 2] | 0) != 0 : 0) ? (H = (R | 0) == 1 ? 2 : 0, D = c[a + 164 >> 2] | 0, Ca = (J << 1) - D >> 6, (((H | 0) > (Ca | 0) ? H : Ca) | 0) < (Y | 0)) : 0) ? (ba = (J << 1) - D >> 6, ba = (H | 0) > (ba | 0) ? H : ba, (ba | 0) < (Y | 0)) : 0) {
			O = E + ba | 0;
			Hc(C, O)
		} else ba = Y;
		aa = O << 3;
		Z = c[u + 12 >> 2] | 0;
		Z = (m | 0) > (Z | 0) ? Z : m;
		ha = B + M | 0;
		Y = $(o, ha) | 0;
		D = ta() | 0;
		da = i;
		i = i + ((4 * Y | 0) + 15 & -16) | 0;
		Y = a + 180 | 0;
		K = +g[Y >> 2];
		H = $(r, B - M | 0) | 0;
		f = c[W >> 2] | 0;
		H = (H | 0) / (f | 0) | 0;
		Ea = +Mb(d, H);
		Ea = K > Ea ? K : Ea;
		K = +Mb(d + (H << 2) | 0, ($(r, M) | 0) / (f | 0) | 0);
		g[Y >> 2] = K;
		K = Ea > K ? Ea : K;
		Y = a + 60 | 0;
		f = K <= 1.0 / +(1 << c[Y >> 2] | 0);
		H = f & 1;
		if ((R | 0) == 1) {
			Bc(C, H, 15);
			if (f) {
				if (j) {
					aa = E + 2 | 0;
					aa = (O | 0) < (aa | 0) ? O : aa;
					Hc(C, aa);
					O = aa;
					_ = aa;
					ba = 2;
					aa = aa << 3
				}
				R = O << 3;
				Ca = C + 20 | 0;
				Ba = c[Ca >> 2] | 0;
				c[Ca >> 2] = Ba + (R - (Lb(Ba, c[C + 28 >> 2] | 0) | 0))
			} else {
				H = 0;
				R = 1
			}
		} else H = 0;
		f = a + 16 | 0;
		ea = u + 16 | 0;
		ga = K > 65536.0;
		fa = 0;
		do {
			Ca = da + (($(fa, ha) | 0) + M << 2) | 0;
			Jb(d + (fa << 2) | 0, Ca, B, o, c[W >> 2] | 0, ea, a + (fa << 2) + 148 | 0, ((c[f >> 2] | 0) == 0 ? 0 : ga) & 1);
			fa = fa + 1 | 0
		} while ((fa | 0) < (o | 0));
		M = a + 68 | 0;
		if ((c[M >> 2] | 0) != 0 & (ba | 0) > 3) if ((l | 0) == 0 & (H | 0) == 0) X = 33;
		else f = 0;
		else if ((ba | 0) > (r * 12 | 0) & (l | 0) == 0 & (H | 0) == 0) X = 33;
		else f = 0;
		if ((X | 0) == 33) if ((c[a + 20 >> 2] | 0) == 0 ? (c[a + 24 >> 2] | 0) > 4 : 0) if ((c[a + 116 >> 2] | 0) == 0 | (x | 0) == 3) f = 1;
		else f = (c[a + 64 >> 2] | 0) != 5010;
		else f = 0;
		ea = a + 100 | 0;
		d = c[ea >> 2] | 0;
		Q = Nb(a, da, Q, o, B, d, s, P, N, f & 1, ba) | 0;
		K = +g[P >> 2];
		if (!(K > .4000000059604645) ? !(+g[a + 108 >> 2] > .4000000059604645) : 0) f = 0;
		else X = 39;
		do
		if ((X | 0) == 39) {
			if ((c[a + 120 >> 2] | 0) != 0 ? !(+g[a + 124 >> 2] > .3) : 0) {
				f = 0;
				break
			}
			Da = +(c[s >> 2] | 0);
			Ea = +(c[a + 104 >> 2] | 0);
			f = Da > Ea * 1.26 | Da < Ea * .79 ? 1 : 0
		}
		while (0);
		fa = (Q | 0) == 0;
		if (fa) {
			if ((l | 0) == 0 ? (R + 16 | 0) <= (aa | 0) : 0) Bc(C, 0, 1)
		} else {
			Bc(C, 1, 1);
			Aa = (c[s >> 2] | 0) + 1 | 0;
			Ca = 32 - (vj(Aa | 0) | 0) | 0;
			Ba = Ca + -5 | 0;
			Dc(C, Ba, 6);
			Ec(C, Aa - (16 << Ba) | 0, Ca + -1 | 0);
			Ec(C, c[N >> 2] | 0, 3);
			Cc(C, d, 304, 2)
		}
		ga = a + 24 | 0;
		if ((c[ga >> 2] | 0) > 0 ? (c[M >> 2] | 0) == 0 : 0) pa = Ob(da, ha, o, F, U) | 0;
		else pa = 0;
		la = (x | 0) > 0;
		a: do
		if (la ? ((Lb(c[C + 20 >> 2] | 0, c[C + 28 >> 2] | 0) | 0) + 3 | 0) <= (aa | 0) : 0) if (pa) {
			R = $(o, B) | 0;
			ka = i;
			i = i + ((4 * R | 0) + 15 & -16) | 0;
			R = i;
			i = i + ((4 * w | 0) + 15 & -16) | 0;
			ra = i;
			i = i + ((4 * w | 0) + 15 & -16) | 0;
			va = (T | 0) == 0;
			if (!va) {
				Ca = (c[ga >> 2] | 0) > 7;
				sa = Ca & 1;
				P = $(r, n) | 0;
				ha = i;
				i = i + ((4 * P | 0) + 15 & -16) | 0;
				if (Ca) {
					Pb(u, 0, da, ka, r, o, x, c[W >> 2] | 0);
					Na(u, ka, R, Z, r, x);
					rd(u, Z, m, R, ha, r);
					na = +(x | 0) * .5;
					N = 0;
					while (1) {
						if ((N | 0) >= (P | 0)) {
							qa = T;
							N = 0;
							break a
						}
						Ca = ha + (N << 2) | 0;
						g[Ca >> 2] = +g[Ca >> 2] + na;
						N = N + 1 | 0
					}
				} else {
					qa = T;
					N = 0
				}
			} else {
				qa = T;
				N = 0;
				X = 55
			}
		} else {
			N = 0;
			X = 53
		} else {
			N = 1;
			X = 53
		}
		while (0);
		if ((X | 0) == 53) {
			R = $(o, B) | 0;
			ka = i;
			i = i + ((4 * R | 0) + 15 & -16) | 0;
			R = i;
			i = i + ((4 * w | 0) + 15 & -16) | 0;
			ra = i;
			i = i + ((4 * w | 0) + 15 & -16) | 0;
			va = 1;
			pa = 0;
			qa = 0;
			X = 55
		}
		if ((X | 0) == 55) {
			sa = $(r, n) | 0;
			ha = i;
			i = i + ((4 * sa | 0) + 15 & -16) | 0;
			sa = 0
		}
		Pb(u, qa, da, ka, r, o, x, c[W >> 2] | 0);
		P = (o | 0) == 2;
		if (P & (r | 0) == 1) c[U >> 2] = 0;
		Na(u, ka, R, Z, r, x);
		b: do
		if (c[M >> 2] | 0) {
			Q = 2;
			while (1) {
				if ((Q | 0) >= (m | 0)) break b;
				Ca = R + (Q << 2) | 0;
				Da = +g[Ca >> 2];
				Ea = +g[R >> 2] * 9999999747378752.0e-20;
				Ea = Da < Ea ? Da : Ea;
				g[Ca >> 2] = Ea;
				g[Ca >> 2] = Ea > 1.0000000036274937e-15 ? Ea : 1.0000000036274937e-15;
				Q = Q + 1 | 0
			}
		}
		while (0);
		rd(u, Z, m, R, ra, r);
		Q = $(r, n) | 0;
		ia = i;
		i = i + ((4 * Q | 0) + 15 & -16) | 0;
		wj(ia | 0, 0, m << 2 | 0) | 0;
		ma = (l | 0) == 0;
		do
		if (ma ? (ca = c[a + 192 >> 2] | 0, (ca | 0) != 0) : 0) {
			wa = c[M >> 2] | 0;
			if (wa) {
				ca = (wa | 0) == 0;
				na = 0.0;
				ua = 0.0;
				oa = 0.0;
				break
			}
			wa = c[a + 92 >> 2] | 0;
			wa = (wa | 0) < 2 ? 2 : wa;
			Aa = 0;
			ua = 0.0;
			oa = 0.0;
			za = 0;
			while (1) {
				if ((za | 0) >= (r | 0)) break;
				ya = $(n, za) | 0;
				na = ua;
				Ba = 0;
				while (1) {
					if ((Ba | 0) >= (wa | 0)) break;
					ua = +g[ca + (ya + Ba << 2) >> 2];
					do
					if (ua < .25) {
						if (!(ua > -2.0)) {
							ua = -2.0;
							break
						}
						if (ua > 0.0) X = 76
					} else {
						ua = .25;
						X = 76
					}
					while (0);
					if ((X | 0) == 76) {
						X = 0;
						ua = ua * .5
					}
					Ca = Ba + 1 | 0;
					Fa = (b[L + (Ca << 1) >> 1] | 0) - (b[L + (Ba << 1) >> 1] | 0) | 0;
					Aa = Aa + Fa | 0;
					na = na + ua * +((Ba << 1 | 1) - wa | 0);
					oa = oa + ua * +(Fa | 0);
					Ba = Ca
				}
				ua = na;
				za = za + 1 | 0
			}
			na = oa / +(Aa | 0) + .20000000298023224;
			oa = ua * 6.0 / +($($($(r, wa + -1 | 0) | 0, wa + 1 | 0) | 0, wa) | 0) * .5;
			if (oa < .03099999949336052) {
				if (!(oa > -.03099999949336052)) oa = -.03099999949336052
			} else oa = .03099999949336052;
			za = (b[L + (wa << 1) >> 1] | 0) / 2 | 0;
			X = 0;
			while (1) {
				ya = X + 1 | 0;
				if ((b[L + (ya << 1) >> 1] | 0) < (za | 0)) X = ya;
				else break
			}
			ya = (r | 0) == 2;
			Aa = 0;
			za = 0;
			while (1) {
				if ((za | 0) >= (wa | 0)) break;
				ua = na + oa * +(za - X | 0);
				Ca = ca + (za << 2) | 0;
				do
				if (ya) {
					Ba = ca + (n + za << 2) | 0;
					if (+g[Ca >> 2] > +g[Ba >> 2]) {
						Ba = Ca;
						break
					}
				} else Ba = Ca;
				while (0);
				Ea = +g[Ba >> 2];
				ua = (Ea < 0.0 ? Ea : 0.0) - ua;
				if (ua > .25) {
					g[ia + (za << 2) >> 2] = ua + -.25;
					Aa = Aa + 1 | 0
				}
				za = za + 1 | 0
			}
			c: do
			if ((Aa | 0) > 2) {
				na = na + .25;
				if (na > 0.0) {
					wj(ia | 0, 0, wa << 2 | 0) | 0;
					oa = 0.0;
					na = 0.0;
					break
				} else X = 0;
				while (1) {
					if ((X | 0) >= (wa | 0)) break c;
					Fa = ia + (X << 2) | 0;
					Ea = +g[Fa >> 2] + -.25;
					g[Fa >> 2] = Ea < 0.0 ? 0.0 : Ea;
					X = X + 1 | 0
				}
			}
			while (0);
			na = na + .20000000298023224;
			ua = oa * 64.0;
			X = 98
		} else {
			na = 0.0;
			ua = 0.0;
			X = 98
		}
		while (0);
		if ((X | 0) == 98) {
			ca = (c[M >> 2] | 0) == 0;
			if (ca) {
				if (va) xa = 0.0;
				else xa = +(x | 0) * .5;
				wa = (r | 0) == 2;
				Ea = -10.0;
				oa = 0.0;
				va = l;
				while (1) {
					if ((va | 0) >= (m | 0)) break;
					Ea = Ea + -1.0;
					Da = +g[ra + (va << 2) >> 2] - xa;
					Da = Ea > Da ? Ea : Da;
					do
					if (wa) {
						Ea = +g[ra + (va + n << 2) >> 2] - xa;
						if (Da > Ea) break;
						Da = Ea
					}
					while (0);
					Ea = Da;
					oa = oa + Da;
					va = va + 1 | 0
				}
				va = a + 196 | 0;
				xa = +g[va >> 2];
				oa = oa / +(m - l | 0) - xa;
				if (!(oa < -1.5)) {
					if (oa > 3.0) oa = 3.0
				} else oa = -1.5;
				g[va >> 2] = xa + oa * .019999999552965164
			} else oa = 0.0
		}
		if (!sa) yj(ha | 0, ra | 0, Q << 2 | 0) | 0;
		if (la) {
			va = C + 20 | 0;
			sa = C + 28 | 0;
			do
			if (((Lb(c[va >> 2] | 0, c[sa >> 2] | 0) | 0) + 3 | 0) <= (aa | 0) & (pa | 0) == 0) if ((c[ga >> 2] | 0) > 4 ^ 1 | ca ^ 1) {
				la = 0;
				W = qa
			} else {
				if (!(Ib(ra, y, n, m, r) | 0)) {
					la = 0;
					W = qa;
					break
				}
				Pb(u, T, da, ka, r, o, x, c[W >> 2] | 0);
				Na(u, ka, R, Z, r, x);
				rd(u, Z, m, R, ra, r);
				xa = +(x | 0) * .5;
				W = 0;
				while (1) {
					if ((W | 0) >= (Q | 0)) break;
					Fa = ha + (W << 2) | 0;
					g[Fa >> 2] = +g[Fa >> 2] + xa;
					W = W + 1 | 0
				}
				g[F >> 2] = .20000000298023224;
				la = 1;
				W = T
			} else {
				la = pa;
				W = qa
			}
			while (0);
			if (((Lb(c[va >> 2] | 0, c[sa >> 2] | 0) | 0) + 3 | 0) <= (aa | 0)) Bc(C, la, 3)
		} else {
			la = pa;
			W = qa
		}
		da = $(r, B) | 0;
		ca = i;
		i = i + ((4 * da | 0) + 15 & -16) | 0;
		Pa(u, ka, ca, R, Z, r, T);
		da = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		d: do
		if ((!((_ | 0) < (r * 15 | 0) | ma ^ 1) ? (c[ga >> 2] | 0) > 1 : 0) ? (c[M >> 2] | 0) == 0 : 0) {
			do
			if ((_ | 0) < 40) ka = 24;
			else {
				if ((_ | 0) < 60) {
					ka = 12;
					break
				}
				ka = (_ | 0) < 100 ? 8 : 6
			}
			while (0);
			U = Qb(u, Z, la, da, ka, ca, B, x, V, +g[F >> 2], c[U >> 2] | 0) | 0;
			V = da + (Z + -1 << 2) | 0;
			ka = Z;
			while (1) {
				if ((ka | 0) >= (m | 0)) break d;
				c[da + (ka << 2) >> 2] = c[V >> 2];
				ka = ka + 1 | 0
			}
		} else X = 132;
		while (0);
		e: do
		if ((X | 0) == 132) {
			c[V >> 2] = 0;
			U = 0;
			while (1) {
				if ((U | 0) >= (m | 0)) {
					U = 0;
					break e
				}
				c[da + (U << 2) >> 2] = la;
				U = U + 1 | 0
			}
		}
		while (0);
		V = i;
		i = i + ((4 * Q | 0) + 15 & -16) | 0;
		gd(u, l, m, Z, ra, y, aa, V, C, r, x, ba, c[a + 12 >> 2] | 0, a + 84 | 0, (c[ga >> 2] | 0) > 3 & 1, c[a + 56 >> 2] | 0, c[M >> 2] | 0);
		Rb(l, m, la, da, x, U, C);
		ka = C + 20 | 0;
		U = C + 28 | 0;
		if (((Lb(c[ka >> 2] | 0, c[U >> 2] | 0) | 0) + 4 | 0) <= (aa | 0)) {
			f: do
			if (!(c[M >> 2] | 0)) {
				ga = c[ga >> 2] | 0;
				do
				if ((W | 0) != 0 | (ga | 0) < 3) X = 141;
				else {
					if ((ba | 0) < (r * 10 | 0)) break;
					if (!ma) {
						X = 141;
						break
					}
					Fa = a + 80 | 0;
					T = Ta(u, ca, a + 88 | 0, c[Fa >> 2] | 0, a + 96 | 0, ea, fa ? 0 : 1, Z, r, T) | 0;
					c[Fa >> 2] = T;
					break f
				}
				while (0);
				do
				if ((X | 0) == 141) {
					if (ga) break;
					c[a + 80 >> 2] = 0;
					T = 0;
					break f
				}
				while (0);
				c[a + 80 >> 2] = 2;
				T = 2
			} else {
				c[ea >> 2] = 0;
				c[a + 80 >> 2] = 2;
				T = 2
			}
			while (0);
			Cc(C, T, 312, 5)
		}
		T = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		X = a + 52 | 0;
		xa = +Sb(ra, ha, n, l, m, r, T, c[Y >> 2] | 0, c[u + 56 >> 2] | 0, la, c[S >> 2] | 0, c[X >> 2] | 0, L, x, _, G, c[M >> 2] | 0, ia);
		if (c[M >> 2] | 0) {
			if ((_ | 0) > 26) S = 8;
			else S = (_ | 0) / 3 | 0;
			c[T >> 2] = S
		}
		S = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		pb(u, S, x, r);
		Y = aa << 3;
		ba = 6;
		ea = l;
		_ = jc(C) | 0;
		Z = 0;
		while (1) {
			if ((ea | 0) >= (m | 0)) break;
			aa = ea + 1 | 0;
			ga = ($(r, (b[L + (aa << 1) >> 1] | 0) - (b[L + (ea << 1) >> 1] | 0) | 0) | 0) << x;
			ha = ga << 3;
			fa = (ga | 0) < 48;
			if ((ha | 0) >= ((fa ? 48 : ga) | 0)) ha = fa ? 48 : ga;
			ia = S + (ea << 2) | 0;
			fa = T + (ea << 2) | 0;
			ea = 0;
			ma = ba;
			ga = 0;
			while (1) {
				if ((_ + (ma << 3) | 0) >= (Y - Z | 0)) break;
				if ((ea | 0) >= (c[ia >> 2] | 0)) break;
				Fa = (ga | 0) < (c[fa >> 2] | 0);
				Bc(C, Fa & 1, ma);
				_ = jc(C) | 0;
				if (!Fa) break;
				ea = ea + ha | 0;
				ma = 1;
				ga = ga + 1 | 0;
				Z = Z + ha | 0
			}
			if (ga) ba = (ba | 0) < 3 ? 2 : ba + -1 | 0;
			c[fa >> 2] = ea;
			ea = aa
		}
		L = (r | 0) == 2;
		if (L) {
			if (x) c[v >> 2] = Tb(u, ca, x, B) | 0;
			aa = a + 188 | 0;
			ea = La(+((h | 0) / 1e3 | 0 | 0), c[aa >> 2] | 0) | 0;
			c[aa >> 2] = ea;
			ba = (l | 0) > (ea | 0);
			if ((m | 0) < ((ba ? l : ea) | 0)) ba = m;
			else ba = ba ? l : ea;
			c[aa >> 2] = ba
		}
		if ((_ + 48 | 0) > (Y - Z | 0)) Y = 5;
		else {
			if (!(c[M >> 2] | 0)) Y = Ub(u, ca, ra, m, x, r, B, a + 120 | 0, a + 184 | 0, +g[F >> 2], c[a + 188 >> 2] | 0, ua, c[a + 72 >> 2] | 0) | 0;
			else Y = 5;
			Cc(C, Y, 496, 7);
			_ = jc(C) | 0
		}
		if (j) {
			j = (c[I >> 2] | 0) - x | 0;
			I = 1275 >>> (3 - x | 0);
			I = (O | 0) < (I | 0) ? O : I;
			aa = J - ((r * 320 | 0) + 160) | 0;
			X = c[X >> 2] | 0;
			O = (X | 0) == 0;
			if (!O) aa = aa + (c[a + 172 >> 2] >> j) | 0;
			f = (Vb(u, a + 120 | 0, aa, x, h, c[a + 92 >> 2] | 0, r, c[a + 188 >> 2] | 0, X, +g[a + 184 >> 2], c[G >> 2] | 0, +g[F >> 2], f, xa, c[a + 64 >> 2] | 0, c[M >> 2] | 0, (c[a + 192 >> 2] | 0) != 0 & 1, na, oa) | 0) + _ | 0;
			G = (_ + Z + 63 >> 6) + 2 - E | 0;
			X = f + 32 >> 6;
			X = ((G | 0) > (X | 0) ? G : X) + E | 0;
			X = ((I | 0) < (X | 0) ? I : X) - E | 0;
			G = (H | 0) == 0;
			F = G ? X : 2;
			Z = a + 176 | 0;
			_ = c[Z >> 2] | 0;
			if ((_ | 0) < 970) {
				c[Z >> 2] = _ + 1;
				na = 1.0 / +(_ + 21 | 0)
			} else na = .0010000000474974513;
			do
			if (!O) {
				Fa = a + 164 | 0;
				c[Fa >> 2] = (c[Fa >> 2] | 0) + ((G ? X << 6 : 128) - J);
				Fa = a + 172 | 0;
				Ca = a + 168 | 0;
				Ba = c[Ca >> 2] | 0;
				J = Ba + ~~ (na * +(((G ? f - J | 0 : 0) << j) - (c[Fa >> 2] | 0) - Ba | 0)) | 0;
				c[Ca >> 2] = J;
				c[Fa >> 2] = 0 - J;
				J = a + 164 | 0;
				j = c[J >> 2] | 0;
				if ((j | 0) >= 0) break;
				if (G) G = (j | 0) / -64 | 0;
				else G = 0;
				c[J >> 2] = 0;
				F = F + G | 0
			}
			while (0);
			O = F + E | 0;
			O = (I | 0) < (O | 0) ? I : O;
			Hc(C, O)
		}
		F = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		G = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		J = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		I = O << 6;
		f = I - (jc(C) | 0) + -1 | 0;
		E = (la | 0) == 0;
		if ((E ^ 1) & (x | 0) > 1) j = (f | 0) >= ((x << 3) + 16 | 0) ? 8 : 0;
		else j = 0;
		X = f - j | 0;
		if (!(c[a + 120 >> 2] | 0)) Z = m + -1 | 0;
		else {
			do
			if ((h | 0) < (r * 32e3 | 0)) h = 13;
			else {
				if ((h | 0) < (r * 48e3 | 0)) {
					h = 16;
					break
				}
				if ((h | 0) < (r * 6e4 | 0)) {
					h = 18;
					break
				}
				h = (h | 0) < (r * 8e4 | 0) ? 19 : 20
			}
			while (0);
			Z = c[a + 144 >> 2] | 0;
			Z = (Z | 0) > (h | 0) ? Z : h
		}
		h = a + 188 | 0;
		f = a + 92 | 0;
		M = sd(u, l, m, T, S, Y, h, v, X, t, G, F, J, r, x, C, 1, c[f >> 2] | 0, (c[M >> 2] | 0) == 0 ? Z : 1) | 0;
		T = c[f >> 2] | 0;
		do
		if (!T) S = M;
		else {
			S = T + 1 | 0;
			T = T + -1 | 0;
			X = (T | 0) > (M | 0);
			if ((S | 0) < ((X ? T : M) | 0)) break;
			S = X ? T : M
		}
		while (0);
		c[f >> 2] = S;
		md(u, l, m, y, V, F, C, r);
		S = i;
		i = i + ((1 * Q | 0) + 15 & -16) | 0;
		if (L) L = ca + (B << 2) | 0;
		else L = 0;
		B = a + 76 | 0;
		Va(1, u, l, m, ca, L, S, R, G, W, c[a + 80 >> 2] | 0, c[v >> 2] | 0, c[h >> 2] | 0, da, I - j | 0, c[t >> 2] | 0, C, x, M, B, c[a + 72 >> 2] | 0);
		if (j) Ec(C, (c[a + 116 >> 2] | 0) < 2 & 1, 1);
		nd(u, l, m, y, V, F, J, (O << 3) - (Lb(c[ka >> 2] | 0, c[U >> 2] | 0) | 0) | 0, C, r);
		g: do
		if (H) {
			t = 0;
			while (1) {
				if ((t | 0) >= (Q | 0)) break g;
				g[a + (e + t << 2) + 200 >> 2] = -28.0;
				t = t + 1 | 0
			}
		}
		while (0);
		c[a + 104 >> 2] = c[s >> 2];
		g[a + 108 >> 2] = K;
		c[a + 112 >> 2] = d;
		if (P & (r | 0) == 1) yj(a + (e + n << 2) + 200 | 0, y | 0, n << 2 | 0) | 0;
		h: do
		if (E) {
			r = w << 2;
			yj(A | 0, z | 0, r | 0) | 0;
			yj(z | 0, y | 0, r | 0) | 0;
			r = 0
		} else {
			r = 0;
			while (1) {
				if ((r | 0) >= (w | 0)) {
					r = 0;
					break h
				}
				Fa = a + (q + r << 2) + 200 | 0;
				Da = +g[Fa >> 2];
				Ea = +g[a + (e + r << 2) + 200 >> 2];
				g[Fa >> 2] = Da < Ea ? Da : Ea;
				r = r + 1 | 0
			}
		}
		while (0);
		do {
			s = $(r, n) | 0;
			t = 0;
			while (1) {
				if ((t | 0) >= (l | 0)) {
					t = m;
					break
				}
				Fa = s + t | 0;
				g[a + (e + Fa << 2) + 200 >> 2] = 0.0;
				g[a + (p + Fa << 2) + 200 >> 2] = -28.0;
				g[a + (q + Fa << 2) + 200 >> 2] = -28.0;
				t = t + 1 | 0
			}
			while (1) {
				if ((t | 0) >= (n | 0)) break;
				Fa = s + t | 0;
				g[a + (e + Fa << 2) + 200 >> 2] = 0.0;
				g[a + (p + Fa << 2) + 200 >> 2] = -28.0;
				g[a + (q + Fa << 2) + 200 >> 2] = -28.0;
				t = t + 1 | 0
			}
			r = r + 1 | 0
		} while ((r | 0) < (o | 0));
		a = a + 116 | 0;
		if (E & (N | 0) == 0) c[a >> 2] = 0;
		else c[a >> 2] = (c[a >> 2] | 0) + 1;
		c[B >> 2] = c[U >> 2];
		Ic(C);
		Fa = (Wb(c[C + 44 >> 2] | 0) | 0) == 0;
		ja(D | 0);
		Fa = Fa ? O : -3;
		i = k;
		return Fa | 0
	}
	function Lb(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function Mb(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0.0,
			d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		e = 0.0;
		c = 0.0;
		f = 0;
		while (1) {
			if ((f | 0) >= (b | 0)) break;
			h = +g[a + (f << 2) >> 2];
			e = e > h ? e : h;
			c = c < h ? c : h;
			f = f + 1 | 0
		}
		h = -c;
		i = d;
		return +(e > h ? e : h)
	}
	function Nb(a, b, d, e, f, h, j, k, l, m, n) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0.0,
			L = 0,
			M = 0;
		r = i;
		i = i + 16 | 0;
		o = r + 8 | 0;
		w = r;
		u = c[a >> 2] | 0;
		s = c[u + 4 >> 2] | 0;
		t = f + 1024 | 0;
		p = $(t, e) | 0;
		v = i;
		i = i + ((4 * p | 0) + 15 & -16) | 0;
		c[o >> 2] = v;
		c[o + 4 >> 2] = v + (t << 2);
		p = s + f | 0;
		q = f << 2;
		y = 0;
		while (1) {
			yj(v | 0, d + (y << 10 << 2) | 0, 4096) | 0;
			yj(v + 4096 | 0, b + (($(y, p) | 0) + s << 2) | 0, q | 0) | 0;
			y = y + 1 | 0;
			if ((y | 0) >= (e | 0)) break;
			v = c[o + (y << 2) >> 2] | 0
		}
		if (!m) {
			c[w >> 2] = 15;
			t = a + 104 | 0;
			m = 15;
			x = 0.0
		} else {
			v = ta() | 0;
			J = i;
			i = i + ((4 * (t >> 1) | 0) + 15 & -16) | 0;
			m = a + 72 | 0;
			Yc(o, J, t, e, c[m >> 2] | 0);
			bd(J + 2048 | 0, J, f, 979, w, c[m >> 2] | 0);
			c[w >> 2] = 1024 - (c[w >> 2] | 0);
			t = a + 104 | 0;
			x = +dd(J, f, w, c[t >> 2] | 0, +g[a + 108 >> 2], c[m >> 2] | 0);
			m = c[w >> 2] | 0;
			if ((m | 0) > 1022) {
				c[w >> 2] = 1022;
				m = 1022
			}
			x = x * .699999988079071;
			w = c[a + 56 >> 2] | 0;
			if ((w | 0) > 2) {
				x = x * .5;
				if ((w | 0) > 4) x = (w | 0) > 8 ? 0.0 : x * .5
			}
			ja(v | 0)
		}
		v = c[t >> 2] | 0;
		J = m - v | 0;
		K = (((J | 0) > -1 ? J : 0 - J | 0) * 10 | 0) > (m | 0) ? .4000000059604645 : .20000000298023224;
		if ((n | 0) < 25) K = K + .10000000149011612;
		if ((n | 0) < 35) K = K + .10000000149011612;
		n = a + 108 | 0;
		z = +g[n >> 2];
		if (z > .4000000059604645) K = K + -.10000000149011612;
		if (z > .550000011920929) K = K + -.10000000149011612;
		if (x < (K > .20000000298023224 ? K : .20000000298023224)) {
			x = 0.0;
			w = 0;
			y = 0
		} else {
			w = +O(+(x - z)) < .10000000149011612;
			w = ~~ + N(+((w ? z : x) * 32.0 / 3.0 + .5));
			y = w + -1 | 0;
			if ((y | 0) > 7) y = 7;
			else y = (w | 0) < 1 ? 0 : y;
			x = +(y + 1 | 0) * .09375;
			w = 1
		}
		A = u + 44 | 0;
		C = s << 2;
		z = -x;
		B = a + 112 | 0;
		u = u + 60 | 0;
		E = (f | 0) > 1024;
		D = 1024 - f << 2;
		F = 0;
		while (1) {
			H = c[A >> 2] | 0;
			G = H - s | 0;
			c[t >> 2] = (v | 0) > 15 ? v : 15;
			J = $(F, p) | 0;
			I = a + (($(F, s) | 0) << 2) + 200 | 0;
			yj(b + (J << 2) | 0, I | 0, C | 0) | 0;
			if ((H | 0) == (s | 0)) {
				H = J + s | 0;
				v = c[o + (F << 2) >> 2] | 0
			} else {
				H = J + s | 0;
				v = c[o + (F << 2) >> 2] | 0;
				M = c[t >> 2] | 0;
				K = -+g[n >> 2];
				L = c[B >> 2] | 0;
				nb(b + (H << 2) | 0, v + 4096 | 0, M, M, G, K, K, L, L, 0, 0)
			}
			nb(b + (H + G << 2) | 0, v + (G + 1024 << 2) | 0, c[t >> 2] | 0, m, f - G | 0, -+g[n >> 2], z, c[B >> 2] | 0, h, c[u >> 2] | 0, s);
			yj(I | 0, b + (J + f << 2) | 0, C | 0) | 0;
			H = F << 10;
			G = d + (H << 2) | 0;
			if (E) zj(G | 0, v + (f << 2) | 0, 4096) | 0;
			else {
				zj(G | 0, d + (H + f << 2) | 0, D | 0) | 0;
				zj(d + (H + 1024 - f << 2) | 0, v + 4096 | 0, q | 0) | 0
			}
			F = F + 1 | 0;
			if ((F | 0) >= (e | 0)) break;
			v = c[t >> 2] | 0
		}
		g[k >> 2] = x;
		c[j >> 2] = m;
		c[l >> 2] = y;
		i = r;
		return w | 0
	}
	function Ob(a, b, e, f, h) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0,
			z = 0.0;
		k = i;
		l = i;
		i = i + ((4 * b | 0) + 15 & -16) | 0;
		s = (b | 0) / 2 | 0;
		n = +(s | 0);
		m = +(s | 0);
		o = s + -5 | 0;
		p = (s * 6 | 0) + -102 | 0;
		r = 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (e | 0)) break;
			v = $(q, b) | 0;
			t = 0.0;
			u = 0.0;
			w = 0;
			while (1) {
				if ((w | 0) >= (b | 0)) break;
				z = +g[a + (w + v << 2) >> 2];
				x = t + z;
				g[l + (w << 2) >> 2] = x;
				t = u + x - z * 2.0;
				u = z - x * .5;
				w = w + 1 | 0
			}
			v = l + 0 | 0;
			w = v + 48 | 0;
			do {
				c[v >> 2] = 0;
				v = v + 4 | 0
			} while ((v | 0) < (w | 0));
			t = 0.0;
			u = 0.0;
			v = 0;
			while (1) {
				if ((v | 0) >= (s | 0)) {
					u = 0.0;
					x = 0.0;
					w = s;
					break
				}
				y = v << 1;
				z = +g[l + (y << 2) >> 2];
				x = +g[l + ((y | 1) << 2) >> 2];
				x = z * z + x * x;
				z = u + (x - u) * .0625;
				g[l + (v << 2) >> 2] = z;
				t = t + x;
				u = z;
				v = v + 1 | 0
			}
			while (1) {
				v = w + -1 | 0;
				if ((w | 0) <= 0) break;
				y = l + (v << 2) | 0;
				x = x + (+g[y >> 2] - x) * .125;
				g[y >> 2] = x;
				if (u > x) {
					w = v;
					continue
				}
				u = x;
				w = v
			}
			t = m / (+P(+(t * u * .5 * n)) + 1.0000000036274937e-15) * 64.0;
			v = 12;
			w = 0;
			while (1) {
				if ((v | 0) >= (o | 0)) break;
				y = ~~ + N(+(t * +g[l + (v << 2) >> 2]));
				if ((y | 0) > 127) y = 127;
				else y = (y | 0) < 0 ? 0 : y;
				v = v + 4 | 0;
				w = w + (d[512 + y >> 0] | 0) | 0
			}
			v = (w << 8 | 0) / (p | 0) | 0;
			if ((v | 0) > (r | 0)) {
				c[h >> 2] = q;
				r = v
			}
			q = q + 1 | 0
		}
		l = (r | 0) > 200 & 1;
		m = +P(+(+(r * 27 | 0))) + -42.0;
		if (!(m < 0.0)) {
			if (!(m > 163.0)) j = 22
		} else {
			m = 0.0;
			j = 22
		}
		if ((j | 0) == 22) if (m * .006899999920278788 + -.139 < 0.0) {
			z = 0.0;
			z = +P(+z);
			g[f >> 2] = z;
			i = k;
			return l | 0
		}
		if (m > 163.0) {
			z = .9856999502182007;
			z = +P(+z);
			g[f >> 2] = z;
			i = k;
			return l | 0
		}
		z = m * .006899999920278788 + -.139;
		z = +P(+z);
		g[f >> 2] = z;
		i = k;
		return l | 0
	}
	function Pb(a, b, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0;
		l = i;
		n = c[a + 4 >> 2] | 0;
		m = c[a + 44 >> 2] | 0;
		if (!b) {
			b = 1;
			m = m << j;
			p = (c[a + 36 >> 2] | 0) - j | 0
		} else p = c[a + 36 >> 2] | 0;
		q = a + 64 | 0;
		j = $(b, m) | 0;
		o = j + n | 0;
		s = a + 60 | 0;
		u = 0;
		do {
			r = $(u, o) | 0;
			t = $($(u, m) | 0, b) | 0;
			a = 0;
			while (1) {
				if ((a | 0) >= (b | 0)) break;
				w = d + (r + ($(a, m) | 0) << 2) | 0;
				Vc(q, w, e + (a + t << 2) | 0, c[s >> 2] | 0, n, p, b);
				a = a + 1 | 0
			}
			u = u + 1 | 0
		} while ((u | 0) < (h | 0));
		a: do
		if ((h | 0) == 2 & (f | 0) == 1) {
			d = 0;
			while (1) {
				if ((d | 0) >= (j | 0)) break a;
				w = e + (d << 2) | 0;
				g[w >> 2] = +g[w >> 2] * .5 + +g[e + (j + d << 2) >> 2] * .5;
				d = d + 1 | 0
			}
		}
		while (0);
		if ((k | 0) == 1) {
			i = l;
			return
		}
		d = (j | 0) / (k | 0) | 0;
		v = +(k | 0);
		k = j - d << 2;
		n = 0;
		do {
			j = $($(n, b) | 0, m) | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (d | 0)) break;
				w = e + (j + h << 2) | 0;
				g[w >> 2] = +g[w >> 2] * v;
				h = h + 1 | 0
			}
			wj(e + (j + d << 2) | 0, 0, k | 0) | 0;
			n = n + 1 | 0
		} while ((n | 0) < (f | 0));
		i = l;
		return
	}
	function Qb(d, e, f, g, h, j, k, l, m, n, o) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = +n;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0.0,
			I = 0,
			J = 0,
			K = 0.0;
		p = i;
		i = i + 16 | 0;
		u = p;
		n = .5 - n;
		if (n < -.25) n = -.009999999776482582;
		else n = n * .03999999910593033;
		r = i;
		i = i + ((4 * e | 0) + 15 & -16) | 0;
		y = d + 32 | 0;
		q = c[y >> 2] | 0;
		s = e + -1 | 0;
		q = (b[q + (e << 1) >> 1] | 0) - (b[q + (s << 1) >> 1] | 0) << l;
		x = i;
		i = i + ((4 * q | 0) + 15 & -16) | 0;
		w = i;
		i = i + ((4 * q | 0) + 15 & -16) | 0;
		q = i;
		i = i + ((4 * e | 0) + 15 & -16) | 0;
		d = i;
		i = i + ((4 * e | 0) + 15 & -16) | 0;
		c[m >> 2] = 0;
		A = $(o, k) | 0;
		k = (f | 0) == 0;
		B = $(l, -2) | 0;
		o = 1 << l;
		z = l + 1 | 0;
		E = 0;
		while (1) {
			if ((E | 0) >= (e | 0)) break;
			C = E + 1 | 0;
			D = c[y >> 2] | 0;
			J = b[D + (E << 1) >> 1] | 0;
			D = (b[D + (C << 1) >> 1] | 0) - J | 0;
			F = D << l;
			D = (D | 0) == 1;
			G = F << 2;
			yj(x | 0, j + (A + (J << l) << 2) | 0, G | 0) | 0;
			if (!k) {
				H = +$b(x, F, l, n);
				if (!D ? (yj(w | 0, x | 0, G | 0) | 0, Ua(w, F >> l, o), v = +$b(w, F, z, n), v < H) : 0) {
					H = v;
					G = -1;
					J = 0;
					t = 10
				} else {
					G = 0;
					J = 0;
					t = 10
				}
			} else {
				I = 1;
				H = +$b(x, F, 0, n);
				G = 0;
				J = 0
			}
			while (1) {
				if ((t | 0) == 10) {
					t = 0;
					I = (f | 0) == 0
				}
				if ((J | 0) >= (((I ? D ^ 1 : 0) & 1) + l | 0)) break;
				if (k) t = J + 1 | 0;
				else t = l - J + -1 | 0;
				Ua(x, F >> J, 1 << J);
				K = +$b(x, F, t, n);
				t = K < H;
				J = J + 1 | 0;
				H = t ? K : H;
				G = t ? J : G;
				t = 10
			}
			if (k) {
				G = $(G, -2) | 0;
				c[r + (E << 2) >> 2] = G;
				F = 0
			} else {
				G = G << 1;
				c[r + (E << 2) >> 2] = G;
				F = l
			}
			E = r + (E << 2) | 0;
			c[m >> 2] = (c[m >> 2] | 0) + (F - ((G | 0) / 2 | 0));
			if (!D) {
				E = C;
				continue
			}
			if (G) if ((G | 0) == (B | 0)) D = B;
			else {
				E = C;
				continue
			} else D = 0;
			c[E >> 2] = D + -1;
			E = C
		}
		j = f << 2;
		y = 0;
		while (1) {
			if ((y | 0) >= 2) break;
			w = j + (y << 1) | 0;
			f = 216 + (l << 3) + w | 0;
			w = (w | 1) + (216 + (l << 3)) | 0;
			o = 0;
			m = k ? h : 0;
			x = 1;
			while (1) {
				if ((x | 0) >= (e | 0)) break;
				F = m + h | 0;
				I = o + h | 0;
				J = c[r + (x << 2) >> 2] | 0;
				G = J - (a[f >> 0] << 1) | 0;
				J = J - (a[w >> 0] << 1) | 0;
				o = ((o | 0) < (F | 0) ? o : F) + ((G | 0) > -1 ? G : 0 - G | 0) | 0;
				m = ((I | 0) < (m | 0) ? I : m) + ((J | 0) > -1 ? J : 0 - J | 0) | 0;
				x = x + 1 | 0
			}
			c[u + (y << 2) >> 2] = (o | 0) < (m | 0) ? o : m;
			y = y + 1 | 0
		}
		if ((c[u + 4 >> 2] | 0) < (c[u >> 2] | 0)) if (k) {
			u = 0;
			t = 32
		} else {
			k = 0;
			u = 1
		} else {
			u = 0;
			if (k) t = 32;
			else k = 0
		}
		if ((t | 0) == 32) k = h;
		m = j + (u << 1) | 0;
		t = 216 + (l << 3) + m | 0;
		l = (m | 1) + (216 + (l << 3)) | 0;
		m = 0;
		j = k;
		k = 1;
		while (1) {
			if ((k | 0) >= (e | 0)) break;
			f = j + h | 0;
			w = q + (k << 2) | 0;
			if ((m | 0) < (f | 0)) {
				c[w >> 2] = 0;
				f = m
			} else c[w >> 2] = 1;
			m = m + h | 0;
			w = d + (k << 2) | 0;
			if ((m | 0) < (j | 0)) {
				c[w >> 2] = 0;
				j = m
			} else c[w >> 2] = 1;
			J = c[r + (k << 2) >> 2] | 0;
			m = J - (a[t >> 0] << 1) | 0;
			J = J - (a[l >> 0] << 1) | 0;
			m = f + ((m | 0) > -1 ? m : 0 - m | 0) | 0;
			j = j + ((J | 0) > -1 ? J : 0 - J | 0) | 0;
			k = k + 1 | 0
		}
		h = (m | 0) >= (j | 0) & 1;
		c[g + (s << 2) >> 2] = h;
		e = e + -2 | 0;
		while (1) {
			if ((e | 0) <= -1) break;
			r = e + 1 | 0;
			if ((h | 0) == 1) {
				h = c[d + (r << 2) >> 2] | 0;
				c[g + (e << 2) >> 2] = h
			} else {
				h = c[q + (r << 2) >> 2] | 0;
				c[g + (e << 2) >> 2] = h
			}
			e = e + -1 | 0
		}
		i = p;
		return u | 0
	}
	function Rb(b, d, e, f, g, h, j) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0;
		k = i;
		o = c[j + 4 >> 2] << 3;
		m = j + 20 | 0;
		n = j + 28 | 0;
		u = Lb(c[m >> 2] | 0, c[n >> 2] | 0) | 0;
		p = (e | 0) != 0;
		t = p ? 2 : 4;
		if ((g | 0) > 0) l = (u + t + 1 | 0) >>> 0 <= o >>> 0;
		else l = 0;
		o = o - (l & 1) | 0;
		p = p ? 4 : 5;
		r = 0;
		q = b;
		s = 0;
		while (1) {
			if ((q | 0) >= (d | 0)) break;
			v = f + (q << 2) | 0;
			if ((u + t | 0) >>> 0 > o >>> 0) c[v >> 2] = r;
			else {
				Bc(j, c[v >> 2] ^ r, t);
				u = Lb(c[m >> 2] | 0, c[n >> 2] | 0) | 0;
				v = c[v >> 2] | 0;
				r = v;
				s = s | v
			}
			t = p;
			q = q + 1 | 0
		}
		m = e << 2;
		if (l ? (a[m + s + (216 + (g << 3)) >> 0] | 0) != (a[(m | 2) + s + (216 + (g << 3)) >> 0] | 0) : 0) {
			Bc(j, h, 1);
			l = h << 1
		} else l = 0;
		l = m + l | 0;
		while (1) {
			if ((b | 0) >= (d | 0)) break;
			v = f + (b << 2) | 0;
			c[v >> 2] = a[l + (c[v >> 2] | 0) + (216 + (g << 3)) >> 0];
			b = b + 1 | 0
		}
		i = k;
		return
	}
	function Sb(a, d, e, f, h, j, k, l, m, n, o, p, q, r, s, t, u, v) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		var w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0.0,
			G = 0,
			H = 0,
			I = 0.0,
			J = 0.0,
			K = 0,
			L = 0,
			M = 0;
		x = i;
		H = $(j, e) | 0;
		y = i;
		i = i + ((4 * H | 0) + 15 & -16) | 0;
		A = i;
		i = i + ((4 * H | 0) + 15 & -16) | 0;
		wj(k | 0, 0, e << 2 | 0) | 0;
		z = +(9 - l | 0);
		l = 0;
		while (1) {
			if ((l | 0) >= (h | 0)) {
				m = 0;
				z = -31.899999618530273;
				l = 0;
				break
			}
			H = l + 5 | 0;
			g[A + (l << 2) >> 2] = +(b[m + (l << 1) >> 1] | 0) * .0625 + .5 + z - +g[20656 + (l << 2) >> 2] + +($(H, H) | 0) * .006200000178068876;
			l = l + 1 | 0
		}
		a: while (1) {
			while (1) {
				if ((l | 0) < (h | 0)) break;
				m = m + 1 | 0;
				if ((m | 0) < (j | 0)) l = 0;
				else break a
			}
			F = +g[a + (($(m, e) | 0) + l << 2) >> 2];
			F = F - +g[A + (l << 2) >> 2];
			z = z > F ? z : F;
			l = l + 1 | 0
		}
		if (!((s | 0) > 50 & (r | 0) > 0 & (u | 0) == 0)) {
			H = 0;
			c[t >> 2] = H;
			i = x;
			return +z
		}
		m = h + -2 | 0;
		B = h + -1 | 0;
		u = 0;
		D = 0;
		do {
			l = $(u, e) | 0;
			C = y + (l << 2) | 0;
			E = d + (l << 2) | 0;
			F = +g[E >> 2];
			g[C >> 2] = F;
			G = 1;
			while (1) {
				if ((G | 0) >= (h | 0)) {
					H = D;
					break
				}
				H = l + G | 0;
				I = +g[d + (H << 2) >> 2];
				H = I > +g[d + (H + -1 << 2) >> 2] + .5 ? G : D;
				J = F + 1.5;
				I = J < I ? J : I;
				g[y + (l + G << 2) >> 2] = I;
				F = I;
				D = H;
				G = G + 1 | 0
			}
			while (1) {
				G = H + -1 | 0;
				if ((H | 0) <= 0) {
					G = 2;
					break
				}
				K = y + (l + G << 2) | 0;
				F = +g[K >> 2];
				I = +g[y + (l + H << 2) >> 2] + 2.0;
				J = +g[d + (l + G << 2) >> 2];
				M = I < J;
				L = F < (M ? I : J);
				g[K >> 2] = L | M ? L ? F : I : J;
				H = G
			}
			while (1) {
				if ((G | 0) >= (m | 0)) break;
				M = y + (l + G << 2) | 0;
				I = +g[M >> 2];
				J = +Zb(d + (l + G + -2 << 2) | 0) + -1.0;
				g[M >> 2] = I > J ? I : J;
				G = G + 1 | 0
			}
			J = +_b(E) + -1.0;
			I = +g[C >> 2];
			g[C >> 2] = I > J ? I : J;
			C = y + (l + 1 << 2) | 0;
			I = +g[C >> 2];
			g[C >> 2] = I > J ? I : J;
			J = +_b(d + (l + h + -3 << 2) | 0) + -1.0;
			C = y + (l + m << 2) | 0;
			I = +g[C >> 2];
			g[C >> 2] = I > J ? I : J;
			C = y + (l + B << 2) | 0;
			I = +g[C >> 2];
			g[C >> 2] = I > J ? I : J;
			C = 0;
			while (1) {
				if ((C | 0) >= (h | 0)) break;
				M = y + (l + C << 2) | 0;
				I = +g[M >> 2];
				J = +g[A + (C << 2) >> 2];
				g[M >> 2] = I > J ? I : J;
				C = C + 1 | 0
			}
			u = u + 1 | 0
		} while ((u | 0) < (j | 0));
		b: do
		if ((j | 0) == 2) {
			d = f;
			while (1) {
				if ((d | 0) >= (h | 0)) {
					a = f;
					break b
				}
				K = d + e | 0;
				L = y + (K << 2) | 0;
				J = +g[L >> 2];
				M = y + (d << 2) | 0;
				I = +g[M >> 2] + -4.0;
				I = J > I ? J : I;
				g[L >> 2] = I;
				J = +g[M >> 2];
				I = I + -4.0;
				I = J > I ? J : I;
				g[M >> 2] = I;
				I = +g[a + (d << 2) >> 2] - I;
				J = +g[a + (K << 2) >> 2] - +g[L >> 2];
				g[M >> 2] = ((I < 0.0 ? 0.0 : I) + (J < 0.0 ? 0.0 : J)) * .5;
				d = d + 1 | 0
			}
		} else {
			e = f;
			while (1) {
				if ((e | 0) >= (h | 0)) {
					a = f;
					break b
				}
				M = y + (e << 2) | 0;
				J = +g[a + (e << 2) >> 2] - +g[M >> 2];
				g[M >> 2] = J < 0.0 ? 0.0 : J;
				e = e + 1 | 0
			}
		}
		while (0);
		while (1) {
			if ((a | 0) >= (h | 0)) break;
			M = y + (a << 2) | 0;
			I = +g[M >> 2];
			J = +g[v + (a << 2) >> 2];
			g[M >> 2] = I > J ? I : J;
			a = a + 1 | 0
		}
		o = (o | 0) == 0;
		c: do
		if (((o ^ 1) & (p | 0) == 0 ^ 1) & (n | 0) == 0) {
			v = f;
			while (1) {
				if ((v | 0) >= (h | 0)) break c;
				M = y + (v << 2) | 0;
				g[M >> 2] = +g[M >> 2] * .5;
				v = v + 1 | 0
			}
		}
		while (0);
		s = (s | 0) / 4 | 0;
		p = (p | 0) == 0;
		n = (n | 0) == 0;
		v = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) {
				w = 48;
				break
			}
			if ((f | 0) >= 8) if ((f | 0) > 11) {
				M = y + (f << 2) | 0;
				F = +g[M >> 2] * .5;
				g[M >> 2] = F
			} else w = 36;
			else {
				w = y + (f << 2) | 0;
				g[w >> 2] = +g[w >> 2] * 2.0;
				w = 36
			}
			if ((w | 0) == 36) {
				w = 0;
				F = +g[y + (f << 2) >> 2]
			}
			F = F < 4.0 ? F : 4.0;
			g[y + (f << 2) >> 2] = F;
			a = f + 1 | 0;
			d = ($((b[q + (a << 1) >> 1] | 0) - (b[q + (f << 1) >> 1] | 0) | 0, j) | 0) << r;
			do
			if ((d | 0) >= 6) if ((d | 0) > 48) {
				M = ~~ (F * 8.0);
				e = M;
				d = (($(M, d) | 0) << 3 | 0) / 8 | 0;
				break
			} else {
				d = ~~ (F * +(d | 0) / 6.0);
				e = d;
				d = d * 48 | 0;
				break
			} else {
				M = ~~F;
				e = M;
				d = ($(M, d) | 0) << 3
			}
			while (0);
			if (!(!o ? p | n ^ 1 : 0)) w = 45;
			if ((w | 0) == 45 ? (w = 0, (v + d >> 6 | 0) > (s | 0)) : 0) break;
			c[k + (f << 2) >> 2] = e;
			f = a;
			v = v + d | 0
		}
		if ((w | 0) == 48) {
			c[t >> 2] = v;
			i = x;
			return +z
		}
		M = s << 6;
		c[k + (f << 2) >> 2] = M - v;
		c[t >> 2] = M;
		i = x;
		return +z
	}
	function Tb(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0.0,
			q = 0.0;
		h = i;
		a = a + 32 | 0;
		m = 0;
		l = 1.0000000036274937e-15;
		n = 1.0000000036274937e-15;
		a: while (1) {
			if ((m | 0) >= 13) break;
			o = c[a >> 2] | 0;
			j = m + 1 | 0;
			k = b[o + (j << 1) >> 1] << e;
			m = b[o + (m << 1) >> 1] << e;
			while (1) {
				if ((m | 0) >= (k | 0)) {
					m = j;
					continue a
				}
				q = +g[d + (m << 2) >> 2];
				p = +g[d + (m + f << 2) >> 2];
				m = m + 1 | 0;
				l = l + (+O(+q) + +O(+p));
				n = n + (+O(+(q + p)) + +O(+(q - p)))
			}
		}
		o = b[(c[a >> 2] | 0) + 26 >> 1] << e + 1;
		i = h;
		return +(o + ((e | 0) < 2 ? 5 : 13) | 0) * n * .7071070075035095 > +(o | 0) * l | 0
	}
	function Ub(a, d, e, f, h, j, k, l, m, n, o, p, q) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = +n;
		o = o | 0;
		p = +p;
		q = q | 0;
		var r = 0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0.0,
			B = 0.0;
		q = i;
		if ((j | 0) == 2) {
			r = a + 32 | 0;
			v = 0;
			s = 0.0;
			while (1) {
				if ((v | 0) >= 8) break;
				y = c[r >> 2] | 0;
				w = b[y + (v << 1) >> 1] | 0;
				z = w << h;
				x = v + 1 | 0;
				v = x;
				s = s + +Yb(d + (z << 2) | 0, d + (z + k << 2) | 0, (b[y + (x << 1) >> 1] | 0) - w << h)
			}
			t = +O(+(s * .125));
			t = t > 1.0 ? 1.0 : t;
			s = t;
			v = 8;
			while (1) {
				if ((v | 0) >= (o | 0)) break;
				y = c[r >> 2] | 0;
				z = b[y + (v << 1) >> 1] | 0;
				x = z << h;
				v = v + 1 | 0;
				u = +O(+(+Yb(d + (x << 2) | 0, d + (x + k << 2) | 0, (b[y + (v << 1) >> 1] | 0) - z << h)));
				if (s < u) continue;
				s = u
			}
			A = +O(+s);
			A = A > 1.0 ? 1.0 : A;
			s = +Z(+(1.0010000467300415 - t * t)) * 1.4426950408889634;
			u = s * .5;
			t = +Z(+(1.0010000467300415 - A * A)) * 1.4426950408889634;
			s = s * .75;
			if (s < -4.0) s = 1.0;
			else s = s + 5.0;
			B = +g[m >> 2] + .25;
			A = -((u > t ? u : t) * .5);
			g[m >> 2] = B < A ? B : A
		} else s = 5.0;
		m = f + -1 | 0;
		a = a + 8 | 0;
		d = 0;
		t = 0.0;
		do {
			k = 0;
			while (1) {
				if ((k | 0) >= (m | 0)) break;
				t = t + +g[e + (k + ($(d, c[a >> 2] | 0) | 0) << 2) >> 2] * +((k << 1) + 2 - f | 0);
				k = k + 1 | 0
			}
			d = d + 1 | 0
		} while ((d | 0) < (j | 0));
		t = (t / +($(m, j) | 0) + 1.0) / 6.0;
		if (!(t > 2.0)) {
			if (t < -2.0) t = -2.0
		} else t = 2.0;
		p = s - t - p - n * 2.0;
		if (c[l >> 2] | 0) {
			n = (+g[l + 8 >> 2] + .05000000074505806) * 2.0;
			if (!(n > 2.0)) {
				if (n < -2.0) n = -2.0
			} else n = 2.0;
			p = p - n
		}
		l = ~~ + N(+(p + .5));
		if ((l | 0) > 10) {
			i = q;
			return 10
		} else {
			i = q;
			return ((l | 0) < 0 ? 0 : l) | 0
		}
		return 0
	}
	function Vb(a, d, e, f, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = +n;
		o = o | 0;
		p = +p;
		q = q | 0;
		r = +r;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = +v;
		w = +w;
		var x = 0,
			y = 0,
			z = 0,
			A = 0.0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0.0;
		x = i;
		y = c[a + 8 >> 2] | 0;
		a = c[a + 32 >> 2] | 0;
		C = (j | 0) == 0 ? y : j;
		E = b[a + (C << 1) >> 1] | 0;
		j = E << 16 >> 16 << f;
		D = (k | 0) == 2;
		if (D) {
			if ((C | 0) > (l | 0)) z = b[a + (l << 1) >> 1] | 0;
			else z = E;
			j = j + (z << 16 >> 16 << f) | 0
		}
		z = (c[d >> 2] | 0) == 0;
		if (!z ? (A = +g[d + 16 >> 2], A < .4) : 0) B = e - ~~ (+(j << 3 | 0) * (.4000000059604645 - A)) | 0;
		else B = e;
		if (D) {
			if ((C | 0) > (l | 0)) E = b[a + (l << 1) >> 1] | 0;
			else l = C;
			l = (E << 16 >> 16 << f) - l | 0;
			if (n < 1.0) n = n + -.10000000149011612;
			else n = .8999999761581421;
			F = +(l | 0) * .800000011920929 / +(j | 0) * +(B | 0);
			A = n * +(l << 3 | 0);
			B = B - ~~ (F < A ? F : A) | 0
		}
		o = B + (o - (16 << f)) | 0;
		o = o + ~~ ((p - ((s | 0) == 5010 ? .019999999552965164 : .03999999910593033)) * +(o | 0)) | 0;
		if ((z ^ 1) & (t | 0) == 0) {
			n = +g[d + 4 >> 2] + -.15000000596046448;
			if (n < 0.0) A = -.09000000357627869;
			else A = n + -.09000000357627869;
			n = +(j << 3 | 0);
			o = o + ~~ (n * 1.2000000476837158 * A) | 0;
			if (q) o = o + ~~ (n * .800000011920929) | 0
		}
		u = (u | 0) == 0;
		if ((u ^ 1) & (t | 0) == 0) {
			E = o + ~~ (+(j << 3 | 0) * v) | 0;
			o = (o | 0) / 4 | 0;
			o = (o | 0) > (E | 0) ? o : E
		}
		E = ~~ (+(($(b[a + (y + -2 << 1) >> 1] << f, k) | 0) << 3 | 0) * r);
		y = o >> 2;
		y = (E | 0) > (y | 0) ? E : y;
		y = (o | 0) < (y | 0) ? o : y;
		if ((u ^ 1) & (t | 0) == 0) {
			E = y;
			D = e << 1;
			C = (D | 0) < (E | 0);
			E = C ? D : E;
			i = x;
			return E | 0
		}
		t = (m | 0) == 0;
		if (t ^ 1 | (h | 0) < 64e3) {
			r = +(h + -32e3 | 0) * 30517578125.0e-15;
			r = r < 0.0 ? 0.0 : r;
			if (!t ? !(r < .6700000166893005) : 0) r = .6700000166893005;
			y = ~~ (r * +(y - e | 0)) + e | 0
		}
		if (!(u & p < .20000000298023224)) {
			E = y;
			D = e << 1;
			C = (D | 0) < (E | 0);
			E = C ? D : E;
			i = x;
			return E | 0
		}
		h = 96e3 - h | 0;
		if ((h | 0) <= 32e3) if ((h | 0) < 0) p = 0.0;
		else p = +(h | 0) * 3099999958067201.0e-21;
		else p = .09919999539852142;
		E = y + ~~ (p * w * +(y | 0)) | 0;
		D = e << 1;
		C = (D | 0) < (E | 0);
		E = C ? D : E;
		i = x;
		return E | 0
	}
	function Wb(a) {
		a = a | 0;
		return a | 0
	}
	function Xb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0;
		e = i;
		i = i + 16 | 0;
		f = e;
		c[f >> 2] = d;
		do
		switch (b | 0) {
		case 4020:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 52 >> 2] = k;
				a = 37;
				break
			};
		case 10012:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) >= 1 ? (b | 0) <= (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
					c[a + 36 >> 2] = b;
					a = 37
				} else a = 38;
				break
			};
		case 4037:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[k >> 2] = c[a + 60 >> 2];
				a = 37;
				break
			};
		case 4010:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) < 0 | (b | 0) > 10) a = 38;
				else {
					c[a + 24 >> 2] = b;
					a = 37
				}
				break
			};
		case 4036:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) < 8 | (b | 0) > 24) a = 38;
				else {
					c[a + 60 >> 2] = b;
					a = 37
				}
				break
			};
		case 4040:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 64 >> 2] = k;
				a = 37;
				break
			};
		case 4006:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 44 >> 2] = k;
				a = 37;
				break
			};
		case 10008:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) < 1 | (b | 0) > 2) a = 38;
				else {
					c[a + 8 >> 2] = b;
					a = 37
				}
				break
			};
		case 10015:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if (!b) a = 38;
				else {
					c[b >> 2] = c[a >> 2];
					a = 37
				}
				break
			};
		case 4028:
			{
				h = a + 4 | 0;
				f = c[h >> 2] | 0;
				b = c[a >> 2] | 0;
				k = c[b + 8 >> 2] | 0;
				d = (c[b + 4 >> 2] | 0) + 1024 + k | 0;
				j = $(f, d) | 0;
				k = $(f, d + k | 0) | 0;
				wj(a + 76 | 0, 0, (Fb(b, f) | 0) + -76 | 0) | 0;
				d = 0;
				while (1) {
					if ((d | 0) >= ($(f, c[b + 8 >> 2] | 0) | 0)) break;
					g[a + (k + d << 2) + 200 >> 2] = -28.0;
					g[a + (j + d << 2) + 200 >> 2] = -28.0;
					b = c[a >> 2] | 0;
					f = c[h >> 2] | 0;
					d = d + 1 | 0
				}
				c[a + 172 >> 2] = 0;
				g[a + 84 >> 2] = 1.0;
				c[a + 80 >> 2] = 2;
				c[a + 88 >> 2] = 256;
				c[a + 96 >> 2] = 0;
				c[a + 100 >> 2] = 0;
				a = 37;
				break
			};
		case 10010:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) >= 0 ? (b | 0) < (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
					c[a + 32 >> 2] = b;
					a = 37
				} else a = 38;
				break
			};
		case 4014:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) < 0 | (b | 0) > 100) a = 38;
				else {
					c[a + 56 >> 2] = b;
					a = 37
				}
				break
			};
		case 10022:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if (!b) a = 37;
				else {
					a = a + 120 | 0;
					c[a + 0 >> 2] = c[b + 0 >> 2];
					c[a + 4 >> 2] = c[b + 4 >> 2];
					c[a + 8 >> 2] = c[b + 8 >> 2];
					c[a + 12 >> 2] = c[b + 12 >> 2];
					c[a + 16 >> 2] = c[b + 16 >> 2];
					c[a + 20 >> 2] = c[b + 20 >> 2];
					c[a + 24 >> 2] = c[b + 24 >> 2];
					a = 37
				}
				break
			};
		case 10024:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 68 >> 2] = k;
				a = 37;
				break
			};
		case 10026:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 192 >> 2] = k;
				a = 37;
				break
			};
		case 10002:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) < 0 | (b | 0) > 2) a = 38;
				else {
					c[a + 20 >> 2] = (b | 0) < 2 & 1;
					c[a + 12 >> 2] = (b | 0) == 0 & 1;
					a = 37
				}
				break
			};
		case 4031:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if (!b) a = 38;
				else {
					c[b >> 2] = c[a + 76 >> 2];
					a = 37
				}
				break
			};
		case 10016:
			{
				j = c[f >> 2] | 0;
				k = c[j >> 2] | 0;
				c[f >> 2] = j + 4;
				c[a + 48 >> 2] = k;
				a = 37;
				break
			};
		case 4002:
			{
				k = c[f >> 2] | 0;
				b = c[k >> 2] | 0;
				c[f >> 2] = k + 4;
				if ((b | 0) >= 501 | (b | 0) == -1) {
					k = (c[a + 4 >> 2] | 0) * 26e4 | 0;
					c[a + 40 >> 2] = (b | 0) < (k | 0) ? b : k;
					a = 37
				} else a = 38;
				break
			};
		default:
			{
				k = -5;
				i = e;
				return k | 0
			}
		}
		while (0);
		if ((a | 0) == 37) {
			k = 0;
			i = e;
			return k | 0
		} else if ((a | 0) == 38) {
			k = -1;
			i = e;
			return k | 0
		}
		return 0
	}
	function Yb(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		f = 0;
		e = 0.0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			h = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = h
		}
		i = d;
		return +e
	}
	function Zb(a) {
		a = a | 0;
		var b = 0,
			c = 0.0,
			d = 0.0,
			e = 0.0,
			f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0;
		b = i;
		c = +g[a + 8 >> 2];
		j = +g[a >> 2];
		d = +g[a + 4 >> 2];
		k = j > d;
		h = k ? j : d;
		j = k ? d : j;
		d = +g[a + 12 >> 2];
		f = +g[a + 16 >> 2];
		a = d > f;
		e = a ? d : f;
		d = a ? f : d;
		a = j > d;
		f = a ? e : h;
		d = a ? j : d;
		e = a ? h : e;
		do
		if (c > f) if (f < d) {
			if (c < d) break;
			c = d;
			break
		} else {
			if (e < f) {
				c = e;
				break
			}
			c = f;
			break
		} else if (c < d) {
			if (f < d) {
				c = f;
				break
			}
			c = d;
			break
		} else {
			if (c < e) break;
			c = e;
			break
		}
		while (0);
		i = b;
		return +c
	}
	function _b(a) {
		a = a | 0;
		var b = 0,
			c = 0.0,
			d = 0.0,
			e = 0.0,
			f = 0;
		b = i;
		c = +g[a >> 2];
		e = +g[a + 4 >> 2];
		f = c > e;
		d = f ? c : e;
		c = f ? e : c;
		e = +g[a + 8 >> 2];
		if (!(d < e)) {
			if (c < e) c = e
		} else c = d;
		i = b;
		return +c
	}
	function $b(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = +d;
		var e = 0,
			f = 0.0,
			h = 0;
		e = i;
		f = 0.0;
		h = 0;
		while (1) {
			if ((h | 0) >= (b | 0)) break;
			f = f + +O(+(+g[a + (h << 2) >> 2]));
			h = h + 1 | 0
		}
		i = e;
		return +(f + +(c | 0) * d * f)
	}
	function ac(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0.0,
			p = 0.0,
			q = 0;
		d = i;
		e = +g[b >> 2];
		f = 0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			g[a + (f << 2) >> 2] = 0.0;
			f = f + 1 | 0
		}
		if (+g[b >> 2] != 0.0) f = 0;
		else {
			i = d;
			return
		}
		while (1) {
			if ((f | 0) < (c | 0)) {
				j = 0.0;
				h = 0
			} else {
				b = 12;
				break
			}
			while (1) {
				if ((h | 0) >= (f | 0)) break;
				j = j + +g[a + (h << 2) >> 2] * +g[b + (f - h << 2) >> 2];
				h = h + 1 | 0
			}
			k = f;
			f = f + 1 | 0;
			m = (j + +g[b + (f << 2) >> 2]) / e;
			j = -m;
			g[a + (k << 2) >> 2] = j;
			l = f >> 1;
			k = k + -1 | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (l | 0)) break;
				q = a + (h << 2) | 0;
				o = +g[q >> 2];
				n = a + (k - h << 2) | 0;
				p = +g[n >> 2];
				g[q >> 2] = o + p * j;
				g[n >> 2] = p + o * j;
				h = h + 1 | 0
			}
			e = e - m * m * e;
			if (e < +g[b >> 2] * .0010000000474974513) {
				b = 12;
				break
			}
		}
		if ((b | 0) == 12) {
			i = d;
			return
		}
	}
	function bc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0,
			r = 0.0;
		k = i;
		i = i + 112 | 0;
		l = k + 96 | 0;
		h = k;
		j = i;
		i = i + ((4 * (e + 24 | 0) | 0) + 15 & -16) | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= 24) {
				b = 0;
				break
			}
			g[h + (m << 2) >> 2] = +g[b + (24 - m + -1 << 2) >> 2];
			m = m + 1 | 0
		}
		while (1) {
			if ((b | 0) >= 24) {
				b = 0;
				break
			}
			g[j + (b << 2) >> 2] = +g[f + (24 - b + -1 << 2) >> 2];
			b = b + 1 | 0
		}
		while (1) {
			if ((b | 0) >= (e | 0)) {
				b = 0;
				break
			}
			g[j + (b + 24 << 2) >> 2] = +g[a + (b << 2) >> 2];
			b = b + 1 | 0
		}
		while (1) {
			if ((b | 0) >= 24) break;
			g[f + (b << 2) >> 2] = +g[a + (e - b + -1 << 2) >> 2];
			b = b + 1 | 0
		}
		b = e + -3 | 0;
		m = l + 4 | 0;
		n = l + 8 | 0;
		o = l + 12 | 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (b | 0)) break;
			c[l + 0 >> 2] = 0;
			c[l + 4 >> 2] = 0;
			c[l + 8 >> 2] = 0;
			c[l + 12 >> 2] = 0;
			cc(h, j + (f << 2) | 0, l, 24);
			g[d + (f << 2) >> 2] = +g[a + (f << 2) >> 2] + +g[l >> 2];
			q = f | 1;
			g[d + (q << 2) >> 2] = +g[a + (q << 2) >> 2] + +g[m >> 2];
			q = f | 2;
			g[d + (q << 2) >> 2] = +g[a + (q << 2) >> 2] + +g[n >> 2];
			q = f | 3;
			g[d + (q << 2) >> 2] = +g[a + (q << 2) >> 2] + +g[o >> 2];
			f = f + 4 | 0
		}
		while (1) {
			if ((f | 0) < (e | 0)) {
				l = 0;
				p = 0.0
			} else break;
			while (1) {
				if ((l | 0) >= 24) break;
				r = p + +g[h + (l << 2) >> 2] * +g[j + (f + l << 2) >> 2];
				l = l + 1 | 0;
				p = r
			}
			g[d + (f << 2) >> 2] = +g[a + (f << 2) >> 2] + p;
			f = f + 1 | 0
		}
		i = k;
		return
	}
	function cc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0.0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0.0,
			y = 0.0;
		j = i;
		m = d + -3 | 0;
		e = c + 4 | 0;
		f = c + 8 | 0;
		h = c + 12 | 0;
		p = b + 12 | 0;
		q = 0;
		k = +g[b >> 2];
		n = +g[b + 4 >> 2];
		l = +g[b + 8 >> 2];
		o = 0.0;
		while (1) {
			if ((q | 0) >= (m | 0)) break;
			v = +g[a >> 2];
			o = +g[p >> 2];
			y = +g[c >> 2] + v * k;
			g[c >> 2] = y;
			x = +g[e >> 2] + v * n;
			g[e >> 2] = x;
			w = +g[f >> 2] + v * l;
			g[f >> 2] = w;
			v = +g[h >> 2] + v * o;
			g[h >> 2] = v;
			u = +g[a + 4 >> 2];
			t = +g[p + 4 >> 2];
			y = y + u * n;
			g[c >> 2] = y;
			x = x + u * l;
			g[e >> 2] = x;
			w = w + u * o;
			g[f >> 2] = w;
			u = v + u * t;
			g[h >> 2] = u;
			v = +g[a + 8 >> 2];
			s = +g[p + 8 >> 2];
			y = y + v * l;
			g[c >> 2] = y;
			x = x + v * o;
			g[e >> 2] = x;
			w = w + v * t;
			g[f >> 2] = w;
			v = u + v * s;
			g[h >> 2] = v;
			u = +g[a + 12 >> 2];
			r = +g[p + 12 >> 2];
			g[c >> 2] = y + u * o;
			g[e >> 2] = x + u * t;
			g[f >> 2] = w + u * s;
			g[h >> 2] = v + u * r;
			a = a + 16 | 0;
			p = p + 16 | 0;
			q = q + 4 | 0;
			k = t;
			n = s;
			l = r
		}
		m = q | 1;
		if ((q | 0) < (d | 0)) {
			y = +g[a >> 2];
			o = +g[p >> 2];
			g[c >> 2] = +g[c >> 2] + y * k;
			g[e >> 2] = +g[e >> 2] + y * n;
			g[f >> 2] = +g[f >> 2] + y * l;
			g[h >> 2] = +g[h >> 2] + y * o;
			a = a + 4 | 0;
			p = p + 4 | 0
		}
		if ((m | 0) < (d | 0)) {
			y = +g[a >> 2];
			k = +g[p >> 2];
			g[c >> 2] = +g[c >> 2] + y * n;
			g[e >> 2] = +g[e >> 2] + y * l;
			g[f >> 2] = +g[f >> 2] + y * o;
			g[h >> 2] = +g[h >> 2] + y * k;
			a = a + 4 | 0;
			p = p + 4 | 0
		}
		if ((m + 1 | 0) >= (d | 0)) {
			i = j;
			return
		}
		x = +g[a >> 2];
		y = +g[p >> 2];
		g[c >> 2] = +g[c >> 2] + x * l;
		g[e >> 2] = +g[e >> 2] + x * o;
		g[f >> 2] = +g[f >> 2] + x * k;
		g[h >> 2] = +g[h >> 2] + x * y;
		i = j;
		return
	}
	function dc(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0,
			u = 0.0,
			v = 0.0,
			w = 0,
			x = 0.0,
			y = 0;
		f = i;
		i = i + 112 | 0;
		k = f + 96 | 0;
		j = f;
		l = d + 24 | 0;
		h = i;
		i = i + ((4 * l | 0) + 15 & -16) | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= 24) {
				m = 0;
				break
			}
			g[j + (m << 2) >> 2] = +g[b + (24 - m + -1 << 2) >> 2];
			m = m + 1 | 0
		}
		while (1) {
			if ((m | 0) >= 24) break;
			g[h + (m << 2) >> 2] = -+g[e + (24 - m + -1 << 2) >> 2];
			m = m + 1 | 0
		}
		while (1) {
			if ((m | 0) >= (l | 0)) break;
			g[h + (m << 2) >> 2] = 0.0;
			m = m + 1 | 0
		}
		o = d + -3 | 0;
		p = k + 4 | 0;
		q = k + 8 | 0;
		r = k + 12 | 0;
		m = b + 4 | 0;
		n = b + 8 | 0;
		l = 0;
		while (1) {
			if ((l | 0) >= (o | 0)) break;
			g[k >> 2] = +g[a + (l << 2) >> 2];
			y = l | 1;
			g[p >> 2] = +g[a + (y << 2) >> 2];
			w = l | 2;
			g[q >> 2] = +g[a + (w << 2) >> 2];
			t = l | 3;
			g[r >> 2] = +g[a + (t << 2) >> 2];
			cc(j, h + (l << 2) | 0, k, 24);
			x = +g[k >> 2];
			s = -x;
			g[h + (l + 24 << 2) >> 2] = s;
			g[c + (l << 2) >> 2] = x;
			x = +g[p >> 2] + +g[b >> 2] * s;
			g[p >> 2] = x;
			u = -x;
			g[h + (l + 25 << 2) >> 2] = u;
			g[c + (y << 2) >> 2] = x;
			x = +g[q >> 2] + +g[b >> 2] * u + +g[m >> 2] * s;
			g[q >> 2] = x;
			v = -x;
			g[h + (l + 26 << 2) >> 2] = v;
			g[c + (w << 2) >> 2] = x;
			s = +g[r >> 2] + +g[b >> 2] * v + +g[m >> 2] * u + +g[n >> 2] * s;
			g[r >> 2] = s;
			g[h + (l + 27 << 2) >> 2] = -s;
			g[c + (t << 2) >> 2] = s;
			l = l + 4 | 0
		}
		while (1) {
			if ((l | 0) >= (d | 0)) {
				a = 0;
				break
			}
			b = 0;
			s = +g[a + (l << 2) >> 2];
			while (1) {
				if ((b | 0) >= 24) break;
				x = s - +g[j + (b << 2) >> 2] * +g[h + (l + b << 2) >> 2];
				b = b + 1 | 0;
				s = x
			}
			g[h + (l + 24 << 2) >> 2] = s;
			g[c + (l << 2) >> 2] = s;
			l = l + 1 | 0
		}
		while (1) {
			if ((a | 0) >= 24) break;
			g[e + (a << 2) >> 2] = +g[c + (d - a + -1 << 2) >> 2];
			a = a + 1 | 0
		}
		i = f;
		return
	}
	function ec(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0,
			o = 0;
		k = i;
		j = f - e | 0;
		l = i;
		i = i + ((4 * f | 0) + 15 & -16) | 0;
		a: do
		if (d) {
			m = 0;
			while (1) {
				if ((m | 0) >= (f | 0)) {
					m = 0;
					break
				}
				g[l + (m << 2) >> 2] = +g[a + (m << 2) >> 2];
				m = m + 1 | 0
			}
			while (1) {
				if ((m | 0) >= (d | 0)) {
					a = l;
					break a
				}
				n = +g[c + (m << 2) >> 2];
				g[l + (m << 2) >> 2] = +g[a + (m << 2) >> 2] * n;
				o = f - m + -1 | 0;
				g[l + (o << 2) >> 2] = +g[a + (o << 2) >> 2] * n;
				m = m + 1 | 0
			}
		}
		while (0);
		_c(a, a, b, j, e + 1 | 0, h);
		h = 0;
		while (1) {
			if ((h | 0) > (e | 0)) break;
			n = 0.0;
			d = h + j | 0;
			while (1) {
				if ((d | 0) >= (f | 0)) break;
				n = n + +g[a + (d << 2) >> 2] * +g[a + (d - h << 2) >> 2];
				d = d + 1 | 0
			}
			o = b + (h << 2) | 0;
			g[o >> 2] = +g[o >> 2] + n;
			h = h + 1 | 0
		}
		i = k;
		return
	}
	function fc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0;
		f = i;
		g = gc(b, a) | 0;
		a = d + 1 | 0;
		Dc(e, g, (c[(c[640 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[640 + (((d | 0) < (b | 0) ? a : b) << 2) >> 2] | 0) + (((a | 0) < (b | 0) ? b : a) << 2) >> 2] | 0) | 0);
		i = f;
		return
	}
	function gc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		f = a + -1 | 0;
		e = c[b + (f << 2) >> 2] | 0;
		h = e >>> 31;
		e = (e | 0) > -1 ? e : 0 - e | 0;
		do {
			f = f + -1 | 0;
			g = a - f | 0;
			h = h + (c[(c[640 + (((g | 0) < (e | 0) ? g : e) << 2) >> 2] | 0) + (((g | 0) > (e | 0) ? g : e) << 2) >> 2] | 0) | 0;
			j = c[b + (f << 2) >> 2] | 0;
			e = e + ((j | 0) > -1 ? j : 0 - j | 0) | 0;
			if ((j | 0) < 0) {
				j = e + 1 | 0;
				h = h + (c[(c[640 + (((g | 0) < (j | 0) ? g : j) << 2) >> 2] | 0) + (((g | 0) > (j | 0) ? g : j) << 2) >> 2] | 0) | 0
			}
		} while ((f | 0) > 0);
		i = d;
		return h | 0
	}
	function hc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0.0,
			g = 0,
			h = 0;
		g = i;
		h = d + 1 | 0;
		f = +ic(b, d, tc(e, (c[(c[640 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[640 + (((d | 0) < (b | 0) ? h : b) << 2) >> 2] | 0) + (((h | 0) < (b | 0) ? b : h) << 2) >> 2] | 0) | 0) | 0, a);
		i = g;
		return +f
	}
	function ic(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0.0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0.0;
		f = i;
		g = 0.0;
		while (1) {
			if ((a | 0) <= 2) break;
			do
			if ((b | 0) < (a | 0)) {
				h = c[(c[640 + (b << 2) >> 2] | 0) + (a << 2) >> 2] | 0;
				j = c[(c[640 + (b + 1 << 2) >> 2] | 0) + (a << 2) >> 2] | 0;
				if (h >>> 0 <= d >>> 0 & d >>> 0 < j >>> 0) {
					c[e >> 2] = 0;
					d = d - h | 0;
					break
				}
				l = d >>> 0 >= j >>> 0;
				h = l << 31 >> 31;
				d = d - (l ? j : 0) | 0;
				j = b;
				do {
					j = j + -1 | 0;
					k = c[(c[640 + (j << 2) >> 2] | 0) + (a << 2) >> 2] | 0
				} while (k >>> 0 > d >>> 0);
				b = b - j + h ^ h;
				c[e >> 2] = b << 16 >> 16;
				m = +((b & 65535) << 16 >> 16);
				d = d - k | 0;
				b = j;
				g = g + m * m
			} else {
				k = c[640 + (a << 2) >> 2] | 0;
				l = c[k + (b + 1 << 2) >> 2] | 0;
				j = d >>> 0 >= l >>> 0;
				h = j << 31 >> 31;
				d = d - (j ? l : 0) | 0;
				a: do
				if ((c[k + (a << 2) >> 2] | 0) >>> 0 > d >>> 0) {
					j = a;
					do {
						j = j + -1 | 0;
						l = c[(c[640 + (j << 2) >> 2] | 0) + (a << 2) >> 2] | 0
					} while (l >>> 0 > d >>> 0)
				} else {
					j = b;
					while (1) {
						l = c[k + (j << 2) >> 2] | 0;
						if (l >>> 0 <= d >>> 0) break a;
						j = j + -1 | 0
					}
				}
				while (0);
				b = b - j + h ^ h;
				c[e >> 2] = b << 16 >> 16;
				m = +((b & 65535) << 16 >> 16);
				d = d - l | 0;
				b = j;
				g = g + m * m
			}
			while (0);
			a = a + -1 | 0;
			e = e + 4 | 0
		}
		h = b << 1 | 1;
		l = d >>> 0 >= h >>> 0;
		a = l << 31 >> 31;
		h = d - (l ? h : 0) | 0;
		d = (h + 1 | 0) >>> 1;
		if (!d) {
			l = h;
			h = b - d | 0;
			h = h + a | 0;
			h = h ^ a;
			j = h & 65535;
			h = h << 16;
			h = h >> 16;
			k = e + 4 | 0;
			c[e >> 2] = h;
			m = +(j << 16 >> 16);
			m = m * m;
			g = g + m;
			j = 0 - l | 0;
			l = d - l | 0;
			j = l ^ j;
			l = j & 65535;
			j = j << 16;
			j = j >> 16;
			c[k >> 2] = j;
			m = +(l << 16 >> 16);
			m = m * m;
			m = g + m;
			i = f;
			return +m
		}
		l = h - ((d << 1) + -1) | 0;
		h = b - d | 0;
		h = h + a | 0;
		h = h ^ a;
		j = h & 65535;
		h = h << 16;
		h = h >> 16;
		k = e + 4 | 0;
		c[e >> 2] = h;
		m = +(j << 16 >> 16);
		m = m * m;
		g = g + m;
		j = 0 - l | 0;
		l = d - l | 0;
		j = l ^ j;
		l = j & 65535;
		j = j << 16;
		j = j >> 16;
		c[k >> 2] = j;
		m = +(l << 16 >> 16);
		m = m * m;
		m = g + m;
		i = f;
		return +m
	}
	function jc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0;
		f = i;
		e = c[a + 20 >> 2] << 3;
		b = c[a + 28 >> 2] | 0;
		d = 32 - (vj(b | 0) | 0) | 0;
		b = b >>> (d + -16 | 0);
		a = (b >>> 12) + -8 | 0;
		i = f;
		return e - ((d << 3) + (a + (b >>> 0 > (c[5792 + (a << 2) >> 2] | 0) >>> 0 & 1))) | 0
	}
	function kc(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0;
		e = i;
		c[a >> 2] = b;
		c[a + 4 >> 2] = d;
		c[a + 8 >> 2] = 0;
		c[a + 12 >> 2] = 0;
		c[a + 16 >> 2] = 0;
		c[a + 20 >> 2] = 9;
		c[a + 24 >> 2] = 0;
		d = a + 28 | 0;
		c[d >> 2] = 128;
		b = lc(a) | 0;
		c[a + 40 >> 2] = b;
		c[a + 32 >> 2] = (c[d >> 2] | 0) + -1 - (b >> 1);
		c[a + 44 >> 2] = 0;
		mc(a);
		i = e;
		return
	}
	function lc(a) {
		a = a | 0;
		var b = 0,
			e = 0,
			f = 0;
		b = i;
		f = a + 24 | 0;
		e = c[f >> 2] | 0;
		if (e >>> 0 >= (c[a + 4 >> 2] | 0) >>> 0) {
			f = 0;
			i = b;
			return f | 0
		}
		c[f >> 2] = e + 1;
		f = d[(c[a >> 2] | 0) + e >> 0] | 0;
		i = b;
		return f | 0
	}
	function mc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		b = i;
		d = a + 28 | 0;
		e = a + 20 | 0;
		f = a + 40 | 0;
		g = a + 32 | 0;
		while (1) {
			h = c[d >> 2] | 0;
			if (h >>> 0 >= 8388609) break;
			c[e >> 2] = (c[e >> 2] | 0) + 8;
			c[d >> 2] = h << 8;
			j = c[f >> 2] | 0;
			h = lc(a) | 0;
			c[f >> 2] = h;
			c[g >> 2] = ((j << 8 | h) >>> 1 & 255 | c[g >> 2] << 8 & 2147483392) ^ 255
		}
		i = b;
		return
	}
	function nc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0;
		d = i;
		e = oc(c[a + 28 >> 2] | 0, b) | 0;
		c[a + 36 >> 2] = e;
		a = (((c[a + 32 >> 2] | 0) >>> 0) / (e >>> 0) | 0) + 1 | 0;
		i = d;
		return b - (a >>> 0 > b >>> 0 ? b : a) | 0
	}
	function oc(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function pc(a) {
		a = a | 0;
		var b = 0;
		b = (c[a + 28 >> 2] | 0) >>> 15;
		c[a + 36 >> 2] = b;
		a = ((c[a + 32 >> 2] | 0) >>> 0) / (b >>> 0) | 0;
		b = a + 1 | 0;
		return 32768 - (b + (b >>> 0 > 32768 ? 32767 - a | 0 : 0)) | 0
	}
	function qc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		f = i;
		g = c[a + 36 >> 2] | 0;
		e = $(g, e - d | 0) | 0;
		h = a + 32 | 0;
		c[h >> 2] = (c[h >> 2] | 0) - e;
		if (!b) {
			d = a + 28 | 0;
			h = d;
			e = (c[d >> 2] | 0) - e | 0;
			c[h >> 2] = e;
			mc(a);
			i = f;
			return
		} else {
			h = a + 28 | 0;
			e = $(g, d - b | 0) | 0;
			c[h >> 2] = e;
			mc(a);
			i = f;
			return
		}
	}
	function rc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		e = a + 28 | 0;
		f = c[e >> 2] | 0;
		g = a + 32 | 0;
		h = c[g >> 2] | 0;
		j = f >>> b;
		b = h >>> 0 < j >>> 0;
		if (!b) {
			c[g >> 2] = h - j;
			j = f - j | 0
		}
		c[e >> 2] = j;
		mc(a);
		i = d;
		return b & 1 | 0
	}
	function sc(a, b, e) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		f = i;
		h = a + 28 | 0;
		l = c[h >> 2] | 0;
		g = a + 32 | 0;
		j = c[g >> 2] | 0;
		e = l >>> e;
		k = -1;
		while (1) {
			k = k + 1 | 0;
			m = $(e, d[b + k >> 0] | 0) | 0;
			if (j >>> 0 >= m >>> 0) break;
			else l = m
		}
		c[g >> 2] = j - m;
		c[h >> 2] = l - m;
		mc(a);
		i = f;
		return k | 0
	}
	function tc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		d = i;
		e = b + -1 | 0;
		f = 32 - (vj(e | 0) | 0) | 0;
		if ((f | 0) <= 8) {
			f = nc(a, b) | 0;
			qc(a, f, f + 1 | 0, b);
			b = f;
			i = d;
			return b | 0
		}
		f = f + -8 | 0;
		g = (e >>> f) + 1 | 0;
		b = nc(a, g) | 0;
		qc(a, b, b + 1 | 0, g);
		f = b << f | (uc(a, f) | 0);
		if (f >>> 0 <= e >>> 0) {
			g = f;
			i = d;
			return g | 0
		}
		c[a + 44 >> 2] = 1;
		g = e;
		i = d;
		return g | 0
	}
	function uc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		e = i;
		f = a + 12 | 0;
		g = c[f >> 2] | 0;
		d = a + 16 | 0;
		h = c[d >> 2] | 0;
		if (h >>> 0 < b >>> 0) do {
			g = g | (vc(a) | 0) << h;
			h = h + 8 | 0
		} while ((h | 0) < 25);
		c[f >> 2] = g >>> b;
		c[d >> 2] = h - b;
		h = a + 20 | 0;
		c[h >> 2] = (c[h >> 2] | 0) + b;
		i = e;
		return g & (1 << b) + -1 | 0
	}
	function vc(a) {
		a = a | 0;
		var b = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		f = a + 8 | 0;
		e = c[f >> 2] | 0;
		g = c[a + 4 >> 2] | 0;
		if (e >>> 0 >= g >>> 0) {
			g = 0;
			i = b;
			return g | 0
		}
		e = e + 1 | 0;
		c[f >> 2] = e;
		g = d[(c[a >> 2] | 0) + (g - e) >> 0] | 0;
		i = b;
		return g | 0
	}
	function wc(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		c[a >> 2] = b;
		c[a + 8 >> 2] = 0;
		c[a + 12 >> 2] = 0;
		c[a + 16 >> 2] = 0;
		c[a + 20 >> 2] = 33;
		c[a + 24 >> 2] = 0;
		c[a + 28 >> 2] = -2147483648;
		c[a + 40 >> 2] = -1;
		c[a + 32 >> 2] = 0;
		c[a + 36 >> 2] = 0;
		c[a + 4 >> 2] = d;
		c[a + 44 >> 2] = 0;
		return
	}
	function xc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0;
		f = i;
		g = a + 28 | 0;
		j = c[g >> 2] | 0;
		h = yc(j, e) | 0;
		if (!b) {
			b = j - ($(h, e - d | 0) | 0) | 0;
			c[g >> 2] = b;
			zc(a);
			i = f;
			return
		} else {
			j = j - ($(h, e - b | 0) | 0) | 0;
			e = a + 32 | 0;
			c[e >> 2] = (c[e >> 2] | 0) + j;
			b = $(h, d - b | 0) | 0;
			c[g >> 2] = b;
			zc(a);
			i = f;
			return
		}
	}
	function yc(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function zc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		e = a + 28 | 0;
		d = a + 32 | 0;
		f = a + 20 | 0;
		g = c[e >> 2] | 0;
		while (1) {
			if (g >>> 0 >= 8388609) break;
			Jc(a, (c[d >> 2] | 0) >>> 23);
			c[d >> 2] = c[d >> 2] << 8 & 2147483392;
			g = c[e >> 2] << 8;
			c[e >> 2] = g;
			c[f >> 2] = (c[f >> 2] | 0) + 8
		}
		i = b;
		return
	}
	function Ac(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		e = i;
		f = a + 28 | 0;
		h = c[f >> 2] | 0;
		g = h >>> 15;
		if (!b) {
			b = h - ($(g, 32768 - d | 0) | 0) | 0;
			c[f >> 2] = b;
			zc(a);
			i = e;
			return
		} else {
			j = h - ($(g, 32768 - b | 0) | 0) | 0;
			h = a + 32 | 0;
			c[h >> 2] = (c[h >> 2] | 0) + j;
			b = $(g, d - b | 0) | 0;
			c[f >> 2] = b;
			zc(a);
			i = e;
			return
		}
	}
	function Bc(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		e = i;
		f = a + 28 | 0;
		j = c[f >> 2] | 0;
		g = a + 32 | 0;
		h = j >>> d;
		d = j - h | 0;
		if (b) {
			c[g >> 2] = (c[g >> 2] | 0) + d;
			d = h
		}
		c[f >> 2] = d;
		zc(a);
		i = e;
		return
	}
	function Cc(a, b, e, f) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		g = i;
		h = a + 28 | 0;
		j = c[h >> 2] | 0;
		f = j >>> f;
		if ((b | 0) > 0) {
			k = e + (b + -1) | 0;
			l = j - ($(f, d[k >> 0] | 0) | 0) | 0;
			j = a + 32 | 0;
			c[j >> 2] = (c[j >> 2] | 0) + l;
			f = $(f, (d[k >> 0] | 0) - (d[e + b >> 0] | 0) | 0) | 0;
			c[h >> 2] = f;
			zc(a);
			i = g;
			return
		} else {
			l = j - ($(f, d[e + b >> 0] | 0) | 0) | 0;
			c[h >> 2] = l;
			zc(a);
			i = g;
			return
		}
	}
	function Dc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0;
		d = i;
		e = c + -1 | 0;
		f = 32 - (vj(e | 0) | 0) | 0;
		if ((f | 0) > 8) {
			c = f + -8 | 0;
			f = b >>> c;
			xc(a, f, f + 1 | 0, (e >>> c) + 1 | 0);
			Ec(a, (1 << c) + -1 & b, c);
			i = d;
			return
		} else {
			xc(a, b, b + 1 | 0, c);
			i = d;
			return
		}
	}
	function Ec(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		f = i;
		g = a + 12 | 0;
		j = c[g >> 2] | 0;
		e = a + 16 | 0;
		k = c[e >> 2] | 0;
		if ((k + d | 0) >>> 0 > 32) {
			h = a + 44 | 0;
			do {
				l = Fc(a, j & 255) | 0;
				c[h >> 2] = c[h >> 2] | l;
				j = j >>> 8;
				k = k + -8 | 0
			} while ((k | 0) > 7)
		}
		c[g >> 2] = j | b << k;
		c[e >> 2] = k + d;
		l = a + 20 | 0;
		c[l >> 2] = (c[l >> 2] | 0) + d;
		i = f;
		return
	}
	function Fc(b, d) {
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0;
		e = i;
		g = b + 8 | 0;
		f = c[g >> 2] | 0;
		h = c[b + 4 >> 2] | 0;
		if (((c[b + 24 >> 2] | 0) + f | 0) >>> 0 >= h >>> 0) {
			b = -1;
			i = e;
			return b | 0
		}
		f = f + 1 | 0;
		c[g >> 2] = f;
		a[(c[b >> 2] | 0) + (h - f) >> 0] = d;
		b = 0;
		i = e;
		return b | 0
	}
	function Gc(b, e, f) {
		b = b | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		g = i;
		h = 8 - f | 0;
		j = (1 << f) + -1 << h;
		if (c[b + 24 >> 2] | 0) {
			l = c[b >> 2] | 0;
			a[l >> 0] = (d[l >> 0] | 0) & (j ^ 255) | e << h;
			i = g;
			return
		}
		k = b + 40 | 0;
		l = c[k >> 2] | 0;
		if ((l | 0) > -1) {
			c[k >> 2] = l & ~j | e << h;
			i = g;
			return
		}
		if ((c[b + 28 >> 2] | 0) >>> 0 > -2147483648 >>> f >>> 0) {
			c[b + 44 >> 2] = -1;
			i = g;
			return
		} else {
			l = b + 32 | 0;
			c[l >> 2] = c[l >> 2] & ~ (j << 23) | e << h + 23;
			i = g;
			return
		}
	}
	function Hc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0;
		d = i;
		f = c[a >> 2] | 0;
		e = c[a + 8 >> 2] | 0;
		a = a + 4 | 0;
		zj(f + (b - e) | 0, f + ((c[a >> 2] | 0) - e) | 0, e | 0) | 0;
		c[a >> 2] = b;
		i = d;
		return
	}
	function Ic(b) {
		b = b | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		e = i;
		m = c[b + 28 >> 2] | 0;
		l = vj(m | 0) | 0;
		f = 2147483647 >>> l;
		g = c[b + 32 >> 2] | 0;
		h = g + f & ~f;
		if ((h | f) >>> 0 >= (g + m | 0) >>> 0) {
			h = f >>> 1;
			h = g + h & ~h;
			l = l + 1 | 0
		}
		while (1) {
			if ((l | 0) <= 0) break;
			Jc(b, h >>> 23);
			h = h << 8 & 2147483392;
			l = l + -8 | 0
		}
		if (!((c[b + 40 >> 2] | 0) <= -1 ? (c[b + 36 >> 2] | 0) == 0 : 0)) Jc(b, 0);
		k = b + 44 | 0;
		h = c[b + 16 >> 2] | 0;
		j = c[b + 12 >> 2] | 0;
		while (1) {
			if ((h | 0) <= 7) break;
			m = Fc(b, j & 255) | 0;
			c[k >> 2] = c[k >> 2] | m;
			h = h + -8 | 0;
			j = j >>> 8
		}
		if (c[k >> 2] | 0) {
			i = e;
			return
		}
		g = b + 24 | 0;
		n = c[g >> 2] | 0;
		m = b + 4 | 0;
		f = b + 8 | 0;
		wj((c[b >> 2] | 0) + n | 0, 0, (c[m >> 2] | 0) - n - (c[f >> 2] | 0) | 0) | 0;
		if ((h | 0) <= 0) {
			i = e;
			return
		}
		f = c[f >> 2] | 0;
		m = c[m >> 2] | 0;
		if (f >>> 0 >= m >>> 0) {
			c[k >> 2] = -1;
			i = e;
			return
		}
		l = 0 - l | 0;
		if ((h | 0) > (l | 0) ? ((c[g >> 2] | 0) + f | 0) >>> 0 >= m >>> 0 : 0) {
			c[k >> 2] = -1;
			j = j & (1 << l) + -1
		}
		n = (c[b >> 2] | 0) + (m - f + -1) | 0;
		a[n >> 0] = d[n >> 0] | 0 | j;
		i = e;
		return
	}
	function Jc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		if ((b | 0) == 255) {
			h = a + 36 | 0;
			c[h >> 2] = (c[h >> 2] | 0) + 1;
			i = d;
			return
		}
		g = b >> 8;
		e = a + 40 | 0;
		f = c[e >> 2] | 0;
		if ((f | 0) > -1) {
			f = Kc(a, f + g | 0) | 0;
			h = a + 44 | 0;
			c[h >> 2] = c[h >> 2] | f
		}
		f = a + 36 | 0;
		if (c[f >> 2] | 0) {
			g = g + 255 & 255;
			h = a + 44 | 0;
			do {
				j = Kc(a, g) | 0;
				c[h >> 2] = c[h >> 2] | j;
				j = (c[f >> 2] | 0) + -1 | 0;
				c[f >> 2] = j
			} while ((j | 0) != 0)
		}
		c[e >> 2] = b & 255;
		i = d;
		return
	}
	function Kc(b, d) {
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		e = i;
		g = b + 24 | 0;
		f = c[g >> 2] | 0;
		if ((f + (c[b + 8 >> 2] | 0) | 0) >>> 0 >= (c[b + 4 >> 2] | 0) >>> 0) {
			b = -1;
			i = e;
			return b | 0
		}
		c[g >> 2] = f + 1;
		a[(c[b >> 2] | 0) + f >> 0] = d;
		b = 0;
		i = e;
		return b | 0
	}
	function Lc(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		g = i;
		i = i + 32 | 0;
		e = g;
		f = c[a + 8 >> 2] | 0;
		f = (f | 0) > 0 ? f : 0;
		c[e >> 2] = 1;
		h = 1;
		j = 0;
		do {
			k = j << 1;
			l = b[a + ((k | 1) << 1) + 12 >> 1] | 0;
			h = $(h, b[a + (k << 1) + 12 >> 1] | 0) | 0;
			j = j + 1 | 0;
			c[e + (j << 2) >> 2] = h
		} while (l << 16 >> 16 != 1);
		h = b[a + ((j << 1) + -1 << 1) + 12 >> 1] | 0;
		k = j;
		while (1) {
			j = k + -1 | 0;
			if ((k | 0) <= 0) break;
			l = j << 1;
			if (!j) k = 1;
			else k = b[a + (l + -1 << 1) + 12 >> 1] | 0;
			l = b[a + (l << 1) + 12 >> 1] | 0;
			if ((l | 0) == 3) {
				l = c[e + (j << 2) >> 2] | 0;
				Oc(d, l << f, a, h, l, k);
				h = k;
				k = j;
				continue
			} else if ((l | 0) == 5) {
				l = c[e + (j << 2) >> 2] | 0;
				Pc(d, l << f, a, h, l, k);
				h = k;
				k = j;
				continue
			} else if ((l | 0) == 2) {
				Mc(d, h, c[e + (j << 2) >> 2] | 0);
				h = k;
				k = j;
				continue
			} else if ((l | 0) == 4) {
				l = c[e + (j << 2) >> 2] | 0;
				Nc(d, l << f, a, h, l, k);
				h = k;
				k = j;
				continue
			} else {
				h = k;
				k = j;
				continue
			}
		}
		i = g;
		return
	}
	function Mc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0.0,
			h = 0.0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0;
		b = i;
		d = 0;
		while (1) {
			if ((d | 0) >= (c | 0)) break;
			j = a + 32 | 0;
			e = j;
			h = +g[e >> 2];
			k = +g[e + 4 >> 2];
			l = +g[a >> 2];
			g[j >> 2] = l - h;
			j = a + 4 | 0;
			f = +g[j >> 2];
			g[a + 36 >> 2] = f - k;
			g[a >> 2] = l + h;
			g[j >> 2] = f + k;
			j = a + 40 | 0;
			k = +g[j >> 2];
			e = a + 44 | 0;
			f = +g[e >> 2];
			h = (k + f) * .7071067690849304;
			k = (f - k) * .7071067690849304;
			m = a + 8 | 0;
			f = +g[m >> 2];
			g[j >> 2] = f - h;
			j = a + 12 | 0;
			l = +g[j >> 2];
			g[e >> 2] = l - k;
			g[m >> 2] = f + h;
			g[j >> 2] = l + k;
			j = a + 52 | 0;
			k = +g[j >> 2];
			m = a + 48 | 0;
			l = +g[m >> 2];
			e = a + 16 | 0;
			h = +g[e >> 2];
			g[m >> 2] = h - k;
			m = a + 20 | 0;
			f = +g[m >> 2];
			g[j >> 2] = f + l;
			g[e >> 2] = h + k;
			g[m >> 2] = f - l;
			m = a + 60 | 0;
			l = +g[m >> 2];
			e = a + 56 | 0;
			f = +g[e >> 2];
			k = (l - f) * .7071067690849304;
			f = (-l - f) * .7071067690849304;
			j = a + 24 | 0;
			l = +g[j >> 2];
			g[e >> 2] = l - k;
			e = a + 28 | 0;
			h = +g[e >> 2];
			g[m >> 2] = h - f;
			g[j >> 2] = l + k;
			g[e >> 2] = h + f;
			a = a + 64 | 0;
			d = d + 1 | 0
		}
		i = b;
		return
	}
	function Nc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0.0,
			A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0.0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0;
		j = i;
		if ((e | 0) == 1) {
			h = 0;
			while (1) {
				if ((h | 0) >= (f | 0)) break;
				u = +g[a >> 2];
				n = a + 16 | 0;
				D = +g[n >> 2];
				x = u - D;
				p = a + 4 | 0;
				z = +g[p >> 2];
				o = a + 20 | 0;
				B = +g[o >> 2];
				v = z - B;
				D = u + D;
				B = z + B;
				q = a + 8 | 0;
				z = +g[q >> 2];
				s = a + 24 | 0;
				u = +g[s >> 2];
				C = z + u;
				r = a + 12 | 0;
				y = +g[r >> 2];
				t = a + 28 | 0;
				w = +g[t >> 2];
				A = y + w;
				g[n >> 2] = D - C;
				g[o >> 2] = B - A;
				g[a >> 2] = D + C;
				g[p >> 2] = B + A;
				u = z - u;
				w = y - w;
				g[q >> 2] = x + w;
				g[r >> 2] = v - u;
				g[s >> 2] = x - w;
				g[t >> 2] = v + u;
				a = a + 32 | 0;
				h = h + 1 | 0
			}
			i = j;
			return
		}
		k = e << 1;
		l = e * 3 | 0;
		m = d + 48 | 0;
		q = b << 1;
		r = b * 3 | 0;
		t = 0;
		while (1) {
			if ((t | 0) >= (f | 0)) break;
			s = a + (($(t, h) | 0) << 3) | 0;
			n = c[m >> 2] | 0;
			o = 0;
			d = n;
			p = n;
			while (1) {
				if ((o | 0) >= (e | 0)) break;
				H = s + (e << 3) | 0;
				y = +g[H >> 2];
				v = +g[d >> 2];
				G = s + (e << 3) + 4 | 0;
				z = +g[G >> 2];
				x = +g[d + 4 >> 2];
				u = y * v - z * x;
				v = y * x + z * v;
				K = s + (k << 3) | 0;
				z = +g[K >> 2];
				x = +g[p >> 2];
				J = s + (k << 3) + 4 | 0;
				y = +g[J >> 2];
				B = +g[p + 4 >> 2];
				w = z * x - y * B;
				x = z * B + y * x;
				F = s + (l << 3) | 0;
				y = +g[F >> 2];
				B = +g[n >> 2];
				E = s + (l << 3) + 4 | 0;
				z = +g[E >> 2];
				A = +g[n + 4 >> 2];
				D = y * B - z * A;
				B = y * A + z * B;
				z = +g[s >> 2];
				A = z - w;
				I = s + 4 | 0;
				y = +g[I >> 2];
				C = y - x;
				w = z + w;
				g[s >> 2] = w;
				x = y + x;
				g[I >> 2] = x;
				y = u + D;
				z = v + B;
				D = u - D;
				B = v - B;
				g[K >> 2] = w - y;
				g[J >> 2] = x - z;
				g[s >> 2] = +g[s >> 2] + y;
				g[I >> 2] = +g[I >> 2] + z;
				g[H >> 2] = A + B;
				g[G >> 2] = C - D;
				g[F >> 2] = A - B;
				g[E >> 2] = C + D;
				s = s + 8 | 0;
				o = o + 1 | 0;
				d = d + (b << 3) | 0;
				p = p + (q << 3) | 0;
				n = n + (r << 3) | 0
			}
			t = t + 1 | 0
		}
		i = j;
		return
	}
	function Oc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0.0;
		k = i;
		j = e << 1;
		l = $(b, e) | 0;
		m = d + 48 | 0;
		n = +g[(c[m >> 2] | 0) + (l << 3) + 4 >> 2];
		d = b << 1;
		l = 0;
		while (1) {
			if ((l | 0) >= (f | 0)) break;
			o = a + (($(l, h) | 0) << 3) | 0;
			q = c[m >> 2] | 0;
			r = e;
			p = q;
			while (1) {
				u = o + (e << 3) | 0;
				A = +g[u >> 2];
				B = +g[p >> 2];
				s = o + (e << 3) + 4 | 0;
				D = +g[s >> 2];
				v = +g[p + 4 >> 2];
				C = A * B - D * v;
				B = A * v + D * B;
				x = o + (j << 3) | 0;
				D = +g[x >> 2];
				v = +g[q >> 2];
				w = o + (j << 3) + 4 | 0;
				A = +g[w >> 2];
				z = +g[q + 4 >> 2];
				t = D * v - A * z;
				v = D * z + A * v;
				A = C + t;
				z = B + v;
				g[u >> 2] = +g[o >> 2] - A * .5;
				y = o + 4 | 0;
				g[s >> 2] = +g[y >> 2] - z * .5;
				t = (C - t) * n;
				v = (B - v) * n;
				g[o >> 2] = +g[o >> 2] + A;
				g[y >> 2] = +g[y >> 2] + z;
				g[x >> 2] = +g[u >> 2] + v;
				g[w >> 2] = +g[s >> 2] - t;
				g[u >> 2] = +g[u >> 2] - v;
				g[s >> 2] = +g[s >> 2] + t;
				r = r + -1 | 0;
				if (!r) break;
				else {
					o = o + 8 | 0;
					p = p + (b << 3) | 0;
					q = q + (d << 3) | 0
				}
			}
			l = l + 1 | 0
		}
		i = k;
		return
	}
	function Pc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0,
			E = 0.0,
			F = 0.0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0.0,
			K = 0,
			L = 0.0,
			M = 0.0,
			N = 0.0,
			O = 0.0,
			P = 0,
			Q = 0;
		j = i;
		q = $(b, e) | 0;
		k = c[d + 48 >> 2] | 0;
		d = k + (q << 3) | 0;
		r = +g[d >> 2];
		m = +g[d + 4 >> 2];
		d = k + (($(b << 1, e) | 0) << 3) | 0;
		l = +g[d >> 2];
		n = +g[d + 4 >> 2];
		d = e << 1;
		q = e * 3 | 0;
		p = e << 2;
		o = 0;
		while (1) {
			if ((o | 0) >= (f | 0)) break;
			x = $(o, h) | 0;
			t = a + (x << 3) | 0;
			u = a + (x + e << 3) | 0;
			w = a + (x + d << 3) | 0;
			s = a + (x + q << 3) | 0;
			x = a + (x + p << 3) | 0;
			v = 0;
			while (1) {
				if ((v | 0) >= (e | 0)) break;
				Q = t;
				J = +g[Q >> 2];
				H = +g[Q + 4 >> 2];
				I = +g[u >> 2];
				Q = $(v, b) | 0;
				C = +g[k + (Q << 3) >> 2];
				P = u + 4 | 0;
				N = +g[P >> 2];
				O = +g[k + (Q << 3) + 4 >> 2];
				A = I * C - N * O;
				C = I * O + N * C;
				N = +g[w >> 2];
				Q = $(v << 1, b) | 0;
				O = +g[k + (Q << 3) >> 2];
				D = w + 4 | 0;
				I = +g[D >> 2];
				F = +g[k + (Q << 3) + 4 >> 2];
				M = N * O - I * F;
				O = N * F + I * O;
				I = +g[s >> 2];
				Q = $(v * 3 | 0, b) | 0;
				F = +g[k + (Q << 3) >> 2];
				y = s + 4 | 0;
				N = +g[y >> 2];
				B = +g[k + (Q << 3) + 4 >> 2];
				z = I * F - N * B;
				F = I * B + N * F;
				N = +g[x >> 2];
				Q = $(v << 2, b) | 0;
				B = +g[k + (Q << 3) >> 2];
				K = x + 4 | 0;
				I = +g[K >> 2];
				G = +g[k + (Q << 3) + 4 >> 2];
				E = N * B - I * G;
				B = N * G + I * B;
				I = A + E;
				G = C + B;
				E = A - E;
				B = C - B;
				C = M + z;
				A = O + F;
				z = M - z;
				F = O - F;
				g[t >> 2] = J + (I + C);
				Q = t + 4 | 0;
				g[Q >> 2] = +g[Q >> 2] + (G + A);
				O = J + I * r + C * l;
				M = H + G * r + A * l;
				N = B * m + F * n;
				L = -(E * m) - z * n;
				g[u >> 2] = O - N;
				g[P >> 2] = M - L;
				g[x >> 2] = O + N;
				g[K >> 2] = M + L;
				C = J + I * l + C * r;
				A = H + G * l + A * r;
				B = F * m - B * n;
				z = E * n - z * m;
				g[w >> 2] = C + B;
				g[D >> 2] = A + z;
				g[s >> 2] = C - B;
				g[y >> 2] = A - z;
				t = t + 8 | 0;
				u = u + 8 | 0;
				w = w + 8 | 0;
				s = s + 8 | 0;
				x = x + 8 | 0;
				v = v + 1 | 0
			}
			o = o + 1 | 0
		}
		i = j;
		return
	}
	function Qc(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0.0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0;
		f = i;
		j = +g[a + 4 >> 2];
		k = a + 44 | 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (c[a >> 2] | 0)) break;
			n = d + (h << 3) | 0;
			m = +g[n >> 2];
			l = +g[n + 4 >> 2];
			g[e + (b[(c[k >> 2] | 0) + (h << 1) >> 1] << 3) >> 2] = j * m;
			g[e + (b[(c[k >> 2] | 0) + (h << 1) >> 1] << 3) + 4 >> 2] = j * l;
			h = h + 1 | 0
		}
		Lc(a, e);
		i = f;
		return
	}
	function Rc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		g = i;
		h = c[b >> 2] | 0;
		if (!h) {
			k = 0;
			d = k + d | 0;
			Ac(a, k, d);
			i = g;
			return
		}
		f = h >> 31;
		j = h + f ^ f;
		h = Sc(d, e) | 0;
		k = 1;
		while (1) {
			if (!((h | 0) != 0 & (k | 0) < (j | 0))) break;
			l = h << 1;
			h = ($(l, e) | 0) >>> 15;
			d = d + (l + 2) | 0;
			k = k + 1 | 0
		}
		if (!h) {
			l = j - k | 0;
			j = (32768 - d - f >> 1) + -1 | 0;
			j = (l | 0) < (j | 0) ? l : j;
			d = d + ((j << 1 | 1) + f) | 0;
			l = 32768 - d | 0;
			c[b >> 2] = k + j + f ^ f;
			l = l >>> 0 > 1 ? 1 : l;
			l = d + l | 0;
			Ac(a, d, l);
			i = g;
			return
		} else {
			k = h + 1 | 0;
			l = k;
			d = d + (k & ~f) | 0;
			l = d + l | 0;
			Ac(a, d, l);
			i = g;
			return
		}
	}
	function Sc(a, b) {
		a = a | 0;
		b = b | 0;
		a = ($(32736 - a | 0, 16384 - b | 0) | 0) >>> 15;
		return a | 0
	}
	function Tc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		f = i;
		d = pc(a) | 0;
		if (d >>> 0 < b >>> 0) {
			h = b;
			b = 0;
			j = 0;
			h = b + h | 0;
			g = h >>> 0 < 32768;
			h = g ? h : 32768;
			qc(a, b, h, 32768);
			i = f;
			return j | 0
		}
		e = (Sc(b, c) | 0) + 1 | 0;
		g = 1;
		while (1) {
			if (e >>> 0 <= 1) break;
			j = e << 1;
			h = b + j | 0;
			if (d >>> 0 < h >>> 0) break;
			e = (($(j + -2 | 0, c) | 0) >>> 15) + 1 | 0;
			b = h;
			g = g + 1 | 0
		}
		if (e >>> 0 < 2) {
			j = (d - b | 0) >>> 1;
			b = b + (j << 1) | 0;
			g = g + j | 0
		}
		c = b + e | 0;
		j = d >>> 0 < c >>> 0;
		h = e;
		b = j ? b : c;
		j = j ? 0 - g | 0 : g;
		h = b + h | 0;
		g = h >>> 0 < 32768;
		h = g ? h : 32768;
		qc(a, b, h, 32768);
		i = f;
		return j | 0
	}
	function Uc(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0,
			f = 0;
		b = i;
		d = 32 - (vj(a | 0) | 0) + -1 >> 1;
		c = 1 << d;
		e = 0;
		while (1) {
			f = (e << 1) + c << d;
			if (f >>> 0 <= a >>> 0) {
				a = a - f | 0;
				e = e + c | 0
			}
			if ((d | 0) > 0) {
				c = c >>> 1;
				d = d + -1 | 0
			} else break
		}
		i = b;
		return e | 0
	}
	function Vc(a, d, e, f, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0.0;
		l = i;
		o = c[a + (j << 2) + 8 >> 2] | 0;
		n = +g[o + 4 >> 2];
		m = c[a >> 2] | 0;
		p = 0;
		a = c[a + 24 >> 2] | 0;
		while (1) {
			q = m >> 1;
			if ((p | 0) >= (j | 0)) break;
			m = q;
			p = p + 1 | 0;
			a = a + (q << 2) | 0
		}
		j = m >> 2;
		r = i;
		i = i + ((4 * q | 0) + 15 & -16) | 0;
		p = i;
		i = i + ((8 * j | 0) + 15 & -16) | 0;
		u = h >> 1;
		m = q + -1 | 0;
		w = h + 3 >> 2;
		s = 0 - q | 0;
		v = 0;
		x = f + (u << 2) | 0;
		y = f + (u + -1 << 2) | 0;
		t = d + (u << 2) | 0;
		u = d + (m + u << 2) | 0;
		d = r;
		while (1) {
			if ((v | 0) >= (w | 0)) break;
			z = +g[y >> 2];
			A = +g[x >> 2];
			g[d >> 2] = z * +g[t + (q << 2) >> 2] + A * +g[u >> 2];
			g[d + 4 >> 2] = A * +g[t >> 2] - z * +g[u + (s << 2) >> 2];
			v = v + 1 | 0;
			x = x + 8 | 0;
			y = y + -8 | 0;
			t = t + 8 | 0;
			u = u + -8 | 0;
			d = d + 8 | 0
		}
		h = f + (h + -1 << 2) | 0;
		w = j - w | 0;
		while (1) {
			if ((v | 0) >= (w | 0)) break;
			g[d >> 2] = +g[u >> 2];
			g[d + 4 >> 2] = +g[t >> 2];
			v = v + 1 | 0;
			t = t + 8 | 0;
			u = u + -8 | 0;
			d = d + 8 | 0
		}
		while (1) {
			if ((v | 0) >= (j | 0)) break;
			g[d >> 2] = +g[h >> 2] * +g[u >> 2] - +g[f >> 2] * +g[t + (s << 2) >> 2];
			g[d + 4 >> 2] = +g[h >> 2] * +g[t >> 2] + +g[f >> 2] * +g[u + (q << 2) >> 2];
			v = v + 1 | 0;
			f = f + 8 | 0;
			h = h + -8 | 0;
			t = t + 8 | 0;
			u = u + -8 | 0;
			d = d + 8 | 0
		}
		q = o + 44 | 0;
		s = 0;
		while (1) {
			if ((s | 0) >= (j | 0)) break;
			C = +g[a + (s << 2) >> 2];
			A = +g[a + (j + s << 2) >> 2];
			B = +g[r >> 2];
			D = +g[r + 4 >> 2];
			z = +(n * (B * C - D * A));
			A = +(n * (D * C + B * A));
			y = p + (b[(c[q >> 2] | 0) + (s << 1) >> 1] << 3) | 0;
			g[y >> 2] = z;
			g[y + 4 >> 2] = A;
			s = s + 1 | 0;
			r = r + 8 | 0
		}
		Lc(o, p);
		q = k << 1;
		o = 0 - q | 0;
		r = 0;
		s = e;
		k = e + (($(m, k) | 0) << 2) | 0;
		while (1) {
			if ((r | 0) >= (j | 0)) break;
			C = +g[p + 4 >> 2];
			B = +g[a + (j + r << 2) >> 2];
			A = +g[p >> 2];
			D = +g[a + (r << 2) >> 2];
			g[s >> 2] = C * B - A * D;
			g[k >> 2] = A * B + C * D;
			p = p + 8 | 0;
			r = r + 1 | 0;
			s = s + (q << 2) | 0;
			k = k + (o << 2) | 0
		}
		i = l;
		return
	}
	function Wc(a, d, e, f, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0.0,
			A = 0.0;
		l = i;
		p = c[a >> 2] | 0;
		o = 0;
		n = c[a + 24 >> 2] | 0;
		while (1) {
			m = p >> 1;
			if ((o | 0) >= (j | 0)) break;
			p = m;
			o = o + 1 | 0;
			n = n + (m << 2) | 0
		}
		o = p >> 2;
		t = d + (($(m + -1 | 0, k) | 0) << 2) | 0;
		p = h >> 1;
		q = e + (p << 2) | 0;
		j = c[a + (j << 2) + 8 >> 2] | 0;
		r = k << 1;
		a = 0 - r | 0;
		s = c[j + 44 >> 2] | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (o | 0)) break;
			w = +g[t >> 2];
			x = +g[n + (k << 2) >> 2];
			y = +g[d >> 2];
			v = +g[n + (o + k << 2) >> 2];
			u = b[s >> 1] << 1;
			g[e + (p + (u | 1) << 2) >> 2] = w * x + y * v;
			g[e + (p + u << 2) >> 2] = y * x - w * v;
			s = s + 2 | 0;
			k = k + 1 | 0;
			d = d + (r << 2) | 0;
			t = t + (a << 2) | 0
		}
		Lc(j, q);
		d = o + 1 >> 1;
		j = 0;
		p = e + (p + m + -2 << 2) | 0;
		while (1) {
			if ((j | 0) >= (d | 0)) break;
			u = q + 4 | 0;
			A = +g[u >> 2];
			w = +g[q >> 2];
			y = +g[n + (j << 2) >> 2];
			z = +g[n + (o + j << 2) >> 2];
			t = p + 4 | 0;
			v = +g[t >> 2];
			x = +g[p >> 2];
			g[q >> 2] = A * y + w * z;
			g[t >> 2] = A * z - w * y;
			y = +g[n + (o - j + -1 << 2) >> 2];
			w = +g[n + (m - j + -1 << 2) >> 2];
			g[p >> 2] = v * y + x * w;
			g[u >> 2] = v * w - x * y;
			j = j + 1 | 0;
			q = q + 8 | 0;
			p = p + -8 | 0
		}
		u = h + -1 | 0;
		h = (h | 0) / 2 | 0;
		n = 0;
		m = f;
		o = f + (u << 2) | 0;
		f = e + (u << 2) | 0;
		while (1) {
			if ((n | 0) >= (h | 0)) break;
			A = +g[f >> 2];
			y = +g[e >> 2];
			z = +g[o >> 2];
			x = +g[m >> 2];
			g[e >> 2] = z * y - x * A;
			g[f >> 2] = x * y + z * A;
			n = n + 1 | 0;
			m = m + 4 | 0;
			o = o + -4 | 0;
			f = f + -4 | 0;
			e = e + 4 | 0
		}
		i = l;
		return
	}
	function Xc() {
		var a = 0,
			b = 0,
			d = 0,
			e = 0,
			f = 0;
		a = i;
		b = 0;
		a: while (1) {
			if ((b | 0) >= 1) {
				f = 0;
				b = 9;
				break
			}
			d = 5824 + (b << 2) | 0;
			e = 0;
			while (1) {
				if ((e | 0) >= 4) break;
				f = c[d >> 2] | 0;
				if ((c[f >> 2] | 0) == 48e3 ? (960 << e | 0) == ($(c[f + 44 >> 2] | 0, c[f + 40 >> 2] | 0) | 0) : 0) {
					b = 9;
					break a
				}
				e = e + 1 | 0
			}
			b = b + 1 | 0
		}
		if ((b | 0) == 9) {
			i = a;
			return f | 0
		}
		return 0
	}
	function Yc(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0,
			r = 0.0;
		k = i;
		i = i + 80 | 0;
		m = k + 56 | 0;
		l = k + 40 | 0;
		j = k + 20 | 0;
		h = k;
		c[j + 0 >> 2] = 0;
		c[j + 4 >> 2] = 0;
		c[j + 8 >> 2] = 0;
		c[j + 12 >> 2] = 0;
		c[j + 16 >> 2] = 0;
		d = d >> 1;
		n = 1;
		while (1) {
			if ((n | 0) >= (d | 0)) break;
			p = n << 1;
			q = c[a >> 2] | 0;
			g[b + (n << 2) >> 2] = ((+g[q + (p + -1 << 2) >> 2] + +g[q + ((p | 1) << 2) >> 2]) * .5 + +g[q + (p << 2) >> 2]) * .5;
			n = n + 1 | 0
		}
		q = c[a >> 2] | 0;
		g[b >> 2] = (+g[q + 4 >> 2] * .5 + +g[q >> 2]) * .5;
		if ((e | 0) == 2) {
			a = a + 4 | 0;
			e = 1;
			while (1) {
				if ((e | 0) >= (d | 0)) break;
				p = e << 1;
				n = c[a >> 2] | 0;
				q = b + (e << 2) | 0;
				g[q >> 2] = +g[q >> 2] + ((+g[n + (p + -1 << 2) >> 2] + +g[n + ((p | 1) << 2) >> 2]) * .5 + +g[n + (p << 2) >> 2]) * .5;
				e = e + 1 | 0
			}
			q = c[a >> 2] | 0;
			g[b >> 2] = +g[b >> 2] + (+g[q + 4 >> 2] * .5 + +g[q >> 2]) * .5
		}
		ec(b, m, 0, 0, 4, d, f);
		g[m >> 2] = +g[m >> 2] * 1.000100016593933;
		f = 1;
		while (1) {
			if ((f | 0) >= 5) break;
			q = m + (f << 2) | 0;
			r = +g[q >> 2];
			o = +(f | 0) * .00800000037997961;
			g[q >> 2] = r - r * o * o;
			f = f + 1 | 0
		}
		ac(l, m, 4);
		m = 0;
		o = 1.0;
		while (1) {
			if ((m | 0) >= 4) break;
			r = o * .8999999761581421;
			q = l + (m << 2) | 0;
			g[q >> 2] = +g[q >> 2] * r;
			m = m + 1 | 0;
			o = r
		}
		o = +g[l >> 2];
		g[h >> 2] = o + .800000011920929;
		r = +g[l + 4 >> 2];
		g[h + 4 >> 2] = r + o * .800000011920929;
		o = +g[l + 8 >> 2];
		g[h + 8 >> 2] = o + r * .800000011920929;
		r = +g[l + 12 >> 2];
		g[h + 12 >> 2] = r + o * .800000011920929;
		g[h + 16 >> 2] = r * .800000011920929;
		Zc(b, h, b, d, j);
		i = k;
		return
	}
	function Zc(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0.0,
			j = 0.0,
			k = 0.0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0,
			v = 0.0,
			w = 0.0,
			x = 0.0;
		f = i;
		l = +g[b >> 2];
		k = +g[b + 4 >> 2];
		j = +g[b + 8 >> 2];
		h = +g[b + 12 >> 2];
		s = +g[b + 16 >> 2];
		u = e + 4 | 0;
		b = e + 8 | 0;
		p = e + 12 | 0;
		m = e + 16 | 0;
		r = +g[e >> 2];
		v = +g[u >> 2];
		t = +g[b >> 2];
		q = +g[p >> 2];
		o = +g[m >> 2];
		n = 0;
		while (1) {
			if ((n | 0) >= (d | 0)) break;
			x = +g[a + (n << 2) >> 2];
			g[c + (n << 2) >> 2] = x + l * r + k * v + j * t + h * q + s * o;
			w = r;
			r = x;
			n = n + 1 | 0;
			o = q;
			q = t;
			t = v;
			v = w
		}
		g[e >> 2] = r;
		g[u >> 2] = v;
		g[b >> 2] = t;
		g[p >> 2] = q;
		g[m >> 2] = o;
		i = f;
		return
	}
	function _c(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		h = i;
		i = i + 16 | 0;
		n = h;
		m = f + -3 | 0;
		o = n + 4 | 0;
		j = n + 8 | 0;
		k = n + 12 | 0;
		l = 0;
		while (1) {
			if ((l | 0) >= (m | 0)) break;
			c[n + 0 >> 2] = 0;
			c[n + 4 >> 2] = 0;
			c[n + 8 >> 2] = 0;
			c[n + 12 >> 2] = 0;
			$c(a, b + (l << 2) | 0, n, e);
			g[d + (l << 2) >> 2] = +g[n >> 2];
			g[d + ((l | 1) << 2) >> 2] = +g[o >> 2];
			g[d + ((l | 2) << 2) >> 2] = +g[j >> 2];
			g[d + ((l | 3) << 2) >> 2] = +g[k >> 2];
			l = l + 4 | 0
		}
		while (1) {
			if ((l | 0) >= (f | 0)) break;
			g[d + (l << 2) >> 2] = +ad(a, b + (l << 2) | 0, e);
			l = l + 1 | 0
		}
		i = h;
		return
	}
	function $c(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0.0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0.0,
			y = 0.0;
		j = i;
		m = d + -3 | 0;
		e = c + 4 | 0;
		f = c + 8 | 0;
		h = c + 12 | 0;
		p = b + 12 | 0;
		q = 0;
		k = +g[b >> 2];
		n = +g[b + 4 >> 2];
		l = +g[b + 8 >> 2];
		o = 0.0;
		while (1) {
			if ((q | 0) >= (m | 0)) break;
			v = +g[a >> 2];
			o = +g[p >> 2];
			y = +g[c >> 2] + v * k;
			g[c >> 2] = y;
			x = +g[e >> 2] + v * n;
			g[e >> 2] = x;
			w = +g[f >> 2] + v * l;
			g[f >> 2] = w;
			v = +g[h >> 2] + v * o;
			g[h >> 2] = v;
			u = +g[a + 4 >> 2];
			t = +g[p + 4 >> 2];
			y = y + u * n;
			g[c >> 2] = y;
			x = x + u * l;
			g[e >> 2] = x;
			w = w + u * o;
			g[f >> 2] = w;
			u = v + u * t;
			g[h >> 2] = u;
			v = +g[a + 8 >> 2];
			s = +g[p + 8 >> 2];
			y = y + v * l;
			g[c >> 2] = y;
			x = x + v * o;
			g[e >> 2] = x;
			w = w + v * t;
			g[f >> 2] = w;
			v = u + v * s;
			g[h >> 2] = v;
			u = +g[a + 12 >> 2];
			r = +g[p + 12 >> 2];
			g[c >> 2] = y + u * o;
			g[e >> 2] = x + u * t;
			g[f >> 2] = w + u * s;
			g[h >> 2] = v + u * r;
			a = a + 16 | 0;
			p = p + 16 | 0;
			q = q + 4 | 0;
			k = t;
			n = s;
			l = r
		}
		m = q | 1;
		if ((q | 0) < (d | 0)) {
			y = +g[a >> 2];
			o = +g[p >> 2];
			g[c >> 2] = +g[c >> 2] + y * k;
			g[e >> 2] = +g[e >> 2] + y * n;
			g[f >> 2] = +g[f >> 2] + y * l;
			g[h >> 2] = +g[h >> 2] + y * o;
			a = a + 4 | 0;
			p = p + 4 | 0
		}
		if ((m | 0) < (d | 0)) {
			y = +g[a >> 2];
			k = +g[p >> 2];
			g[c >> 2] = +g[c >> 2] + y * n;
			g[e >> 2] = +g[e >> 2] + y * l;
			g[f >> 2] = +g[f >> 2] + y * o;
			g[h >> 2] = +g[h >> 2] + y * k;
			a = a + 4 | 0;
			p = p + 4 | 0
		}
		if ((m + 1 | 0) >= (d | 0)) {
			i = j;
			return
		}
		x = +g[a >> 2];
		y = +g[p >> 2];
		g[c >> 2] = +g[c >> 2] + x * l;
		g[e >> 2] = +g[e >> 2] + x * o;
		g[f >> 2] = +g[f >> 2] + x * k;
		g[h >> 2] = +g[h >> 2] + x * y;
		i = j;
		return
	}
	function ad(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		f = 0;
		e = 0.0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			h = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = h
		}
		i = d;
		return +e
	}
	function bd(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0.0;
		j = i;
		i = i + 16 | 0;
		m = j;
		n = m;
		c[n >> 2] = 0;
		c[n + 4 >> 2] = 0;
		n = d + e | 0;
		q = d >> 2;
		o = i;
		i = i + ((4 * q | 0) + 15 & -16) | 0;
		n = n >> 2;
		p = i;
		i = i + ((4 * n | 0) + 15 & -16) | 0;
		l = e >> 1;
		k = i;
		i = i + ((4 * l | 0) + 15 & -16) | 0;
		r = 0;
		while (1) {
			if ((r | 0) >= (q | 0)) {
				r = 0;
				break
			}
			g[o + (r << 2) >> 2] = +g[a + (r << 1 << 2) >> 2];
			r = r + 1 | 0
		}
		while (1) {
			if ((r | 0) >= (n | 0)) break;
			g[p + (r << 2) >> 2] = +g[b + (r << 1 << 2) >> 2];
			r = r + 1 | 0
		}
		n = e >> 2;
		_c(o, p, k, q, n, h);
		cd(k, p, q, n, m);
		n = m + 4 | 0;
		d = d >> 1;
		e = 0;
		while (1) {
			if ((e | 0) >= (l | 0)) break;
			o = k + (e << 2) | 0;
			g[o >> 2] = 0.0;
			r = e - (c[m >> 2] << 1) | 0;
			if (!((((r | 0) > -1 ? r : 0 - r | 0) | 0) > 2 ? (r = e - (c[n >> 2] << 1) | 0, (((r | 0) > -1 ? r : 0 - r | 0) | 0) > 2) : 0)) {
				u = +ad(a, b + (e << 2) | 0, d);
				g[o >> 2] = u < -1.0 ? -1.0 : u
			}
			e = e + 1 | 0
		}
		cd(k, b, d, l, m);
		m = c[m >> 2] | 0;
		if ((m | 0) <= 0) {
			r = 0;
			h = m << 1;
			r = h - r | 0;
			c[f >> 2] = r;
			i = j;
			return
		}
		if ((m | 0) >= (l + -1 | 0)) {
			r = 0;
			h = m << 1;
			r = h - r | 0;
			c[f >> 2] = r;
			i = j;
			return
		}
		s = +g[k + (m + -1 << 2) >> 2];
		t = +g[k + (m << 2) >> 2];
		u = +g[k + (m + 1 << 2) >> 2];
		if (u - s > (t - s) * .699999988079071) {
			r = 1;
			h = m << 1;
			r = h - r | 0;
			c[f >> 2] = r;
			i = j;
			return
		}
		if (s - u > (t - u) * .699999988079071) {
			r = -1;
			h = m << 1;
			r = h - r | 0;
			c[f >> 2] = r;
			i = j;
			return
		}
		r = 0;
		h = m << 1;
		r = h - r | 0;
		c[f >> 2] = r;
		i = j;
		return
	}
	function cd(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0.0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0;
		k = i;
		c[f >> 2] = 0;
		h = f + 4 | 0;
		c[h >> 2] = 1;
		l = 1.0;
		n = 0;
		while (1) {
			if ((n | 0) >= (d | 0)) {
				p = 0;
				o = 0.0;
				q = 0.0;
				m = -1.0;
				r = -1.0;
				n = 0;
				break
			}
			t = +g[b + (n << 2) >> 2];
			l = l + t * t;
			n = n + 1 | 0
		}
		while (1) {
			if ((n | 0) >= (e | 0)) break;
			s = +g[a + (n << 2) >> 2];
			do
			if (s > 0.0 ? (j = s * 9.999999960041972e-13, j = j * j, j * q > r * l) : 0) if (j * o > m * l) {
				c[h >> 2] = p;
				c[f >> 2] = n;
				p = n;
				t = l;
				q = o;
				s = j;
				r = m;
				break
			} else {
				c[h >> 2] = n;
				t = o;
				q = l;
				s = m;
				r = j;
				break
			} else {
				t = o;
				s = m
			}
			while (0);
			m = +g[b + (n + d << 2) >> 2];
			o = +g[b + (n << 2) >> 2];
			o = l + (m * m - o * o);
			l = o < 1.0 ? 1.0 : o;
			o = t;
			m = s;
			n = n + 1 | 0
		}
		i = k;
		return
	}
	function dd(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = +f;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0.0,
			A = 0,
			B = 0.0,
			C = 0.0,
			D = 0.0,
			E = 0.0,
			F = 0;
		h = i;
		i = i + 2080 | 0;
		m = h + 2072 | 0;
		k = h + 2068 | 0;
		n = h + 2064 | 0;
		j = h + 2052 | 0;
		F = c[d >> 2] | 0;
		q = (F | 0) / 2 | 0;
		o = (e | 0) / 2 | 0;
		e = (b | 0) / 2 | 0;
		b = a + 2048 | 0;
		F = (F | 0) < 1024;
		p = F ? q : 511;
		c[d >> 2] = F ? q : 511;
		q = h;
		ed(b, b, a + (512 - p << 2) | 0, e, k, m);
		l = +g[k >> 2];
		g[q >> 2] = l;
		k = 1;
		s = l;
		while (1) {
			if ((k | 0) > 512) break;
			D = +g[a + (512 - k << 2) >> 2];
			E = +g[a + (e - k + 512 << 2) >> 2];
			E = s + D * D - E * E;
			g[q + (k << 2) >> 2] = E < 0.0 ? 0.0 : E;
			k = k + 1 | 0;
			s = E
		}
		x = +g[q + (p << 2) >> 2];
		y = +g[m >> 2];
		E = y / +P(+(l * x + 1.0));
		r = p << 1;
		s = l * 2.0;
		t = E * .699999988079071;
		u = E * .8500000238418579;
		w = f * .5;
		k = p;
		l = E;
		v = 2;
		while (1) {
			if ((v | 0) >= 16) break;
			F = v << 1;
			A = fd(r + v | 0, F) | 0;
			if ((A | 0) < 7) break;
			if ((v | 0) == 2) {
				F = A + p | 0;
				F = (F | 0) > 512 ? p : F
			} else F = fd(($(c[20592 + (v << 2) >> 2] << 1, p) | 0) + v | 0, F) | 0;
			ed(b, a + (512 - A << 2) | 0, a + (512 - F << 2) | 0, e, m, n);
			C = +g[m >> 2] + +g[n >> 2];
			g[m >> 2] = C;
			B = +g[q + (A << 2) >> 2] + +g[q + (F << 2) >> 2];
			z = C / +P(+(s * B + 1.0));
			F = A - o | 0;
			F = (F | 0) > -1 ? F : 0 - F | 0;
			if ((F | 0) >= 2) if ((F | 0) < 3) {
				F = ($(v * 5 | 0, v) | 0) < (p | 0);
				E = F ? w : 0.0
			} else E = 0.0;
			else E = f;
			D = t - E;
			D = D < .30000001192092896 ? .30000001192092896 : D;
			if ((A | 0) < 21) {
				D = u - E;
				if (D < .4000000059604645) D = .4000000059604645
			}
			if (z > D) {
				k = A;
				y = C;
				x = B;
				l = z
			}
			v = v + 1 | 0
		}
		f = y < 0.0 ? 0.0 : y;
		if (!(x <= f)) f = f / (x + 1.0);
		else f = 1.0;
		m = 0;
		while (1) {
			if ((m | 0) >= 3) break;
			g[j + (m << 2) >> 2] = +ad(b, a + (1 - (k + m) + 512 << 2) | 0, e);
			m = m + 1 | 0
		}
		t = +g[j + 8 >> 2];
		s = +g[j >> 2];
		u = +g[j + 4 >> 2];
		if (t - s > (u - s) * .699999988079071) {
			F = 1;
			A = f > l;
			E = A ? l : f;
			A = k << 1;
			F = A + F | 0;
			A = (F | 0) < 15;
			F = A ? 15 : F;
			c[d >> 2] = F;
			i = h;
			return +E
		}
		if (s - t > (u - t) * .699999988079071) {
			F = -1;
			A = f > l;
			E = A ? l : f;
			A = k << 1;
			F = A + F | 0;
			A = (F | 0) < 15;
			F = A ? 15 : F;
			c[d >> 2] = F;
			i = h;
			return +E
		}
		F = 0;
		A = f > l;
		E = A ? l : f;
		A = k << 1;
		F = A + F | 0;
		A = (F | 0) < 15;
		F = A ? 15 : F;
		c[d >> 2] = F;
		i = h;
		return +E
	}
	function ed(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0.0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0.0;
		k = i;
		l = 0;
		h = 0.0;
		j = 0.0;
		while (1) {
			if ((l | 0) >= (d | 0)) break;
			m = +g[a + (l << 2) >> 2];
			n = h + m * +g[b + (l << 2) >> 2];
			m = j + m * +g[c + (l << 2) >> 2];
			l = l + 1 | 0;
			h = n;
			j = m
		}
		g[e >> 2] = h;
		g[f >> 2] = j;
		i = k;
		return
	}
	function fd(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function gd(a, b, d, e, f, h, j, k, l, m, n, o, p, q, r, s, t) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		var u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0,
			C = 0.0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0;
		u = i;
		i = i + 96 | 0;
		x = u + 72 | 0;
		y = u + 48 | 0;
		w = u + 24 | 0;
		v = u;
		if (!p) if ((r | 0) == 0 ? (A = d - b | 0, +g[q >> 2] > +($(m << 1, A) | 0)) : 0) B = ($(A, m) | 0) < (o | 0);
		else B = 0;
		else B = 1;
		s = ~~ (+(j >>> 0) * +g[q >> 2] * +(s | 0) / +(m << 9 | 0));
		p = a + 8 | 0;
		D = c[p >> 2] | 0;
		z = +hd(f, h, b, e, D, m);
		e = l + 28 | 0;
		A = id(c[l + 20 >> 2] | 0, c[e >> 2] | 0) | 0;
		F = (A + 3 | 0) >>> 0 > j >>> 0;
		B = F ? 0 : B & 1;
		F = F ? 0 : r;
		if (!((d - b | 0) > 10 ? (C = +(o | 0) * .125, !(C > 16.0)) : 0)) C = 16.0;
		C = (t | 0) == 0 ? C : 3.0;
		c[x + 0 >> 2] = c[l + 0 >> 2];
		c[x + 4 >> 2] = c[l + 4 >> 2];
		c[x + 8 >> 2] = c[l + 8 >> 2];
		c[x + 12 >> 2] = c[l + 12 >> 2];
		c[x + 16 >> 2] = c[l + 16 >> 2];
		c[x + 20 >> 2] = c[l + 20 >> 2];
		o = l + 24 | 0;
		r = c[o >> 2] | 0;
		c[y + 0 >> 2] = c[e + 0 >> 2];
		c[y + 4 >> 2] = c[e + 4 >> 2];
		c[y + 8 >> 2] = c[e + 8 >> 2];
		c[y + 12 >> 2] = c[e + 12 >> 2];
		c[y + 16 >> 2] = c[e + 16 >> 2];
		G = $(D, m) | 0;
		D = i;
		i = i + ((4 * G | 0) + 15 & -16) | 0;
		E = i;
		i = i + ((4 * G | 0) + 15 & -16) | 0;
		yj(D | 0, h | 0, G << 2 | 0) | 0;
		G = (F | 0) == 0;
		if (G) if (!B) {
			F = r;
			H = 0;
			I = 13
		} else {
			jd(a, b, d, f, D, j, A, 20802 + (n * 84 | 0) | 0, E, l, m, n, 1, C, t) | 0;
			I = 19
		} else {
			H = jd(a, b, d, f, D, j, A, 20802 + (n * 84 | 0) | 0, E, l, m, n, 1, C, t) | 0;
			if (!B) {
				F = c[o >> 2] | 0;
				I = 13
			} else I = 19
		}
		if ((I | 0) == 13) {
			O = jc(l) | 0;
			N = c[l >> 2] | 0;
			M = l + 4 | 0;
			c[w + 0 >> 2] = c[M + 0 >> 2];
			c[w + 4 >> 2] = c[M + 4 >> 2];
			c[w + 8 >> 2] = c[M + 8 >> 2];
			c[w + 12 >> 2] = c[M + 12 >> 2];
			c[w + 16 >> 2] = c[M + 16 >> 2];
			c[v + 0 >> 2] = c[e + 0 >> 2];
			c[v + 4 >> 2] = c[e + 4 >> 2];
			c[v + 8 >> 2] = c[e + 8 >> 2];
			c[v + 12 >> 2] = c[e + 12 >> 2];
			c[v + 16 >> 2] = c[e + 16 >> 2];
			P = kd(r) | 0;
			Q = kd(F) | 0;
			J = (ld(N) | 0) + P | 0;
			L = Q - P | 0;
			I = ta() | 0;
			K = i;
			i = i + ((1 * ((Q | 0) == (P | 0) ? 1 : L) | 0) + 15 & -16) | 0;
			yj(K | 0, J | 0, L | 0) | 0;
			c[l + 0 >> 2] = c[x + 0 >> 2];
			c[l + 4 >> 2] = c[x + 4 >> 2];
			c[l + 8 >> 2] = c[x + 8 >> 2];
			c[l + 12 >> 2] = c[x + 12 >> 2];
			c[l + 16 >> 2] = c[x + 16 >> 2];
			c[l + 20 >> 2] = c[x + 20 >> 2];
			c[o >> 2] = r;
			c[e + 0 >> 2] = c[y + 0 >> 2];
			c[e + 4 >> 2] = c[y + 4 >> 2];
			c[e + 8 >> 2] = c[y + 8 >> 2];
			c[e + 12 >> 2] = c[y + 12 >> 2];
			c[e + 16 >> 2] = c[y + 16 >> 2];
			x = jd(a, b, d, f, h, j, A, 20760 + (n * 84 | 0) + (B * 42 | 0) | 0, k, l, m, n, 0, C, t) | 0;
			do
			if (!G) {
				if ((H | 0) >= (x | 0)) {
					if ((H | 0) != (x | 0)) break;
					if (((jc(l) | 0) + s | 0) <= (O | 0)) break
				}
				c[l >> 2] = N;
				c[M + 0 >> 2] = c[w + 0 >> 2];
				c[M + 4 >> 2] = c[w + 4 >> 2];
				c[M + 8 >> 2] = c[w + 8 >> 2];
				c[M + 12 >> 2] = c[w + 12 >> 2];
				c[M + 16 >> 2] = c[w + 16 >> 2];
				c[o >> 2] = F;
				c[e + 0 >> 2] = c[v + 0 >> 2];
				c[e + 4 >> 2] = c[v + 4 >> 2];
				c[e + 8 >> 2] = c[v + 8 >> 2];
				c[e + 12 >> 2] = c[v + 12 >> 2];
				c[e + 16 >> 2] = c[v + 16 >> 2];
				yj(J | 0, K | 0, L | 0) | 0;
				yj(h | 0, D | 0, ($(c[p >> 2] | 0, m) | 0) << 2 | 0) | 0;
				yj(k | 0, E | 0, ($(c[p >> 2] | 0, m) | 0) << 2 | 0) | 0;
				B = 1
			}
			while (0);
			ja(I | 0)
		} else if ((I | 0) == 19) {
			yj(h | 0, D | 0, ($(c[p >> 2] | 0, m) | 0) << 2 | 0) | 0;
			yj(k | 0, E | 0, ($(c[p >> 2] | 0, m) | 0) << 2 | 0) | 0
		}
		if (B) {
			C = z;
			g[q >> 2] = C;
			i = u;
			return
		}
		C = +g[21096 + (n << 2) >> 2];
		C = C * C * +g[q >> 2] + z;
		g[q >> 2] = C;
		i = u;
		return
	}
	function hd(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0;
		k = i;
		h = 0;
		l = 0.0;
		do {
			j = $(h, e) | 0;
			m = c;
			while (1) {
				if ((m | 0) >= (d | 0)) break;
				o = m + j | 0;
				n = +g[a + (o << 2) >> 2] - +g[b + (o << 2) >> 2];
				l = l + n * n;
				m = m + 1 | 0
			}
			h = h + 1 | 0
		} while ((h | 0) < (f | 0));
		i = k;
		return +(l > 200.0 ? 200.0 : l)
	}
	function id(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function jd(a, b, e, f, h, j, k, l, m, n, o, p, q, r, s) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = +r;
		s = s | 0;
		var t = 0,
			u = 0,
			v = 0,
			w = 0.0,
			x = 0.0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0.0,
			F = 0,
			G = 0,
			H = 0.0,
			I = 0.0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			O = 0,
			P = 0.0,
			Q = 0.0;
		v = i;
		i = i + 16 | 0;
		t = v;
		u = v + 8 | 0;
		O = t;
		c[O >> 2] = 0;
		c[O + 4 >> 2] = 0;
		if ((k + 3 | 0) <= (j | 0)) Bc(n, q, 3);
		if (!q) {
			w = +g[21112 + (p << 2) >> 2];
			x = +g[21096 + (p << 2) >> 2]
		} else {
			w = .149993896484375;
			x = 0.0
		}
		p = a + 8 | 0;
		a = n + 20 | 0;
		k = n + 28 | 0;
		q = o * 3 | 0;
		A = (s | 0) == 0;
		J = 0;
		z = b;
		while (1) {
			if ((z | 0) >= (e | 0)) break;
			B = $(q, e - z | 0) | 0;
			y = (z | 0) != (b | 0);
			D = (z | 0) < 20;
			C = z << 1;
			s = (z | 0) > 1;
			F = 0;
			do {
				G = z + ($(F, c[p >> 2] | 0) | 0) | 0;
				P = +g[f + (G << 2) >> 2];
				Q = +g[h + (G << 2) >> 2];
				I = x * (Q < -9.0 ? -9.0 : Q);
				G = t + (F << 2) | 0;
				H = +g[G >> 2];
				E = P - I - H;
				K = ~~ + N(+(E + .5));
				c[u >> 2] = K;
				Q = (Q < -28.0 ? -28.0 : Q) - r;
				if ((K | 0) < 0 & P < Q) {
					K = K + ~~ (Q - P) | 0;
					K = (K | 0) > 0 ? 0 : K;
					c[u >> 2] = K
				}
				L = j - (id(c[a >> 2] | 0, c[k >> 2] | 0) | 0) | 0;
				O = L - B | 0;
				if (y & (O | 0) < 30 & (O | 0) < 24) {
					M = (K | 0) > 1 ? 1 : K;
					c[u >> 2] = M;
					if ((O | 0) < 16) {
						M = (M | 0) < -1 ? -1 : M;
						c[u >> 2] = M
					}
				} else M = K;
				if (!(A | s ^ 1)) {
					M = (M | 0) < 0 ? M : 0;
					c[u >> 2] = M
				}
				do
				if ((L | 0) <= 14) if ((L | 0) <= 1) if ((L | 0) > 0) {
					O = (M | 0) > 0 ? 0 : M;
					c[u >> 2] = O;
					Bc(n, 0 - O | 0, 1);
					break
				} else {
					c[u >> 2] = -1;
					break
				} else {
					if ((M | 0) < 1) L = (M | 0) < -1 ? -1 : M;
					else L = 1;
					c[u >> 2] = L;
					Cc(n, L << 1 ^ L >> 31, 21128, 2);
					break
				} else {
					O = D ? C : 40;
					Rc(n, u, (d[l + O >> 0] | 0) << 7, (d[l + (O | 1) >> 0] | 0) << 6)
				}
				while (0);
				O = c[u >> 2] | 0;
				Q = +(O | 0);
				g[m + (z + ($(F, c[p >> 2] | 0) | 0) << 2) >> 2] = E - Q;
				O = K - O | 0;
				J = J + ((O | 0) > -1 ? O : 0 - O | 0) | 0;
				g[h + (z + ($(F, c[p >> 2] | 0) | 0) << 2) >> 2] = I + H + Q;
				g[G >> 2] = H + Q - w * Q;
				F = F + 1 | 0
			} while ((F | 0) < (o | 0));
			z = z + 1 | 0
		}
		i = v;
		return (A ? J : 0) | 0
	}
	function kd(a) {
		a = a | 0;
		return a | 0
	}
	function ld(a) {
		a = a | 0;
		return a | 0
	}
	function md(a, b, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0;
		l = i;
		a = a + 8 | 0;
		while (1) {
			if ((b | 0) >= (d | 0)) break;
			m = h + (b << 2) | 0;
			p = c[m >> 2] | 0;
			o = 1 << p;
			if ((p | 0) >= 1) {
				n = +((o & 65535) << 16 >> 16);
				o = (o << 16 >> 16) + -1 | 0;
				p = 0;
				do {
					q = ~~ + N(+((+g[f + (b + ($(p, c[a >> 2] | 0) | 0) << 2) >> 2] + .5) * n));
					s = (q | 0) > (o | 0);
					q = ((s ? o : q) | 0) < 0 ? 0 : s ? o : q;
					Ec(j, q, c[m >> 2] | 0);
					r = (+(q | 0) + .5) * +(1 << 14 - (c[m >> 2] | 0) | 0) * 6103515625.0e-14 + -.5;
					q = e + (b + ($(p, c[a >> 2] | 0) | 0) << 2) | 0;
					g[q >> 2] = +g[q >> 2] + r;
					q = f + (b + ($(p, c[a >> 2] | 0) | 0) << 2) | 0;
					g[q >> 2] = +g[q >> 2] - r;
					p = p + 1 | 0
				} while ((p | 0) < (k | 0))
			}
			b = b + 1 | 0
		}
		i = l;
		return
	}
	function nd(a, b, d, e, f, h, j, k, l, m) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		n = i;
		a = a + 8 | 0;
		o = 0;
		while (1) {
			if ((o | 0) < 2) p = b;
			else break;
			while (1) {
				if (!((p | 0) < (d | 0) & (k | 0) >= (m | 0))) break;
				q = h + (p << 2) | 0;
				if ((c[q >> 2] | 0) <= 7 ? (c[j + (p << 2) >> 2] | 0) == (o | 0) : 0) {
					r = 0;
					do {
						t = !(+g[f + (p + ($(r, c[a >> 2] | 0) | 0) << 2) >> 2] < 0.0) & 1;
						Ec(l, t, 1);
						s = e + (p + ($(r, c[a >> 2] | 0) | 0) << 2) | 0;
						g[s >> 2] = +g[s >> 2] + (+(t | 0) + -.5) * +(1 << 14 - (c[q >> 2] | 0) + -1 | 0) * 6103515625.0e-14;
						k = k + -1 | 0;
						r = r + 1 | 0
					} while ((r | 0) < (m | 0))
				}
				p = p + 1 | 0
			}
			o = o + 1 | 0
		}
		i = n;
		return
	}
	function od(a, b, e, f, h, j, k, l) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0.0,
			z = 0;
		r = i;
		i = i + 16 | 0;
		n = r;
		w = n;
		c[w >> 2] = 0;
		c[w + 4 >> 2] = 0;
		if (!h) {
			m = +g[21112 + (l << 2) >> 2];
			q = +g[21096 + (l << 2) >> 2]
		} else {
			m = .149993896484375;
			q = 0.0
		}
		s = c[j + 4 >> 2] << 3;
		p = j + 20 | 0;
		o = j + 28 | 0;
		a = a + 8 | 0;
		while (1) {
			if ((b | 0) >= (e | 0)) break;
			t = (b | 0) < 20;
			u = b << 1;
			v = 0;
			do {
				w = s - (id(c[p >> 2] | 0, c[o >> 2] | 0) | 0) | 0;
				do
				if ((w | 0) <= 14) {
					if ((w | 0) > 1) {
						w = sc(j, 21128, 2) | 0;
						w = w >> 1 ^ 0 - (w & 1);
						break
					}
					if ((w | 0) > 0) w = 0 - (rc(j, 1) | 0) | 0;
					else w = -1
				} else {
					w = t ? u : 40;
					w = Tc(j, (d[20760 + (l * 84 | 0) + (h * 42 | 0) + w >> 0] | 0) << 7, (d[(w | 1) + (20760 + (l * 84 | 0) + (h * 42 | 0)) >> 0] | 0) << 6) | 0
				}
				while (0);
				x = +(w | 0);
				z = f + (b + ($(v, c[a >> 2] | 0) | 0) << 2) | 0;
				y = +g[z >> 2];
				g[z >> 2] = y < -9.0 ? -9.0 : y;
				z = f + (b + ($(v, c[a >> 2] | 0) | 0) << 2) | 0;
				w = n + (v << 2) | 0;
				y = +g[w >> 2];
				g[z >> 2] = q * +g[z >> 2] + y + x;
				g[w >> 2] = y + x - m * x;
				v = v + 1 | 0
			} while ((v | 0) < (k | 0));
			b = b + 1 | 0
		}
		i = r;
		return
	}
	function pd(a, b, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0;
		k = i;
		a = a + 8 | 0;
		while (1) {
			if ((b | 0) >= (d | 0)) break;
			l = f + (b << 2) | 0;
			m = c[l >> 2] | 0;
			a: do
			if ((m | 0) >= 1) {
				n = 0;
				while (1) {
					o = +(uc(h, m) | 0) + .5;
					m = e + (b + ($(n, c[a >> 2] | 0) | 0) << 2) | 0;
					g[m >> 2] = +g[m >> 2] + (o * +(1 << 14 - (c[l >> 2] | 0) | 0) * 6103515625.0e-14 + -.5);
					n = n + 1 | 0;
					if ((n | 0) >= (j | 0)) break a;
					m = c[l >> 2] | 0
				}
			}
			while (0);
			b = b + 1 | 0
		}
		i = k;
		return
	}
	function qd(a, b, d, e, f, h, j, k, l) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0;
		m = i;
		a = a + 8 | 0;
		n = 0;
		while (1) {
			if ((n | 0) < 2) o = b;
			else break;
			while (1) {
				if (!((o | 0) < (d | 0) & (j | 0) >= (l | 0))) break;
				p = f + (o << 2) | 0;
				if ((c[p >> 2] | 0) <= 7 ? (c[h + (o << 2) >> 2] | 0) == (n | 0) : 0) {
					q = 0;
					do {
						s = +(uc(k, 1) | 0) + -.5;
						r = e + (o + ($(q, c[a >> 2] | 0) | 0) << 2) | 0;
						g[r >> 2] = +g[r >> 2] + s * +(1 << 14 - (c[p >> 2] | 0) + -1 | 0) * 6103515625.0e-14;
						j = j + -1 | 0;
						q = q + 1 | 0
					} while ((q | 0) < (l | 0))
				}
				o = o + 1 | 0
			}
			n = n + 1 | 0
		}
		i = m;
		return
	}
	function rd(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0;
		j = i;
		a = a + 8 | 0;
		k = 0;
		do {
			l = 0;
			while (1) {
				if ((l | 0) >= (b | 0)) {
					l = b;
					break
				}
				m = l + ($(k, c[a >> 2] | 0) | 0) | 0;
				n = +Z(+(+g[e + (m << 2) >> 2])) * 1.4426950408889634;
				g[f + (m << 2) >> 2] = n - +g[20656 + (l << 2) >> 2];
				l = l + 1 | 0
			}
			while (1) {
				if ((l | 0) >= (d | 0)) break;
				g[f + (($(k, c[a >> 2] | 0) | 0) + l << 2) >> 2] = -14.0;
				l = l + 1 | 0
			}
			k = k + 1 | 0
		} while ((k | 0) < (h | 0));
		i = j;
		return
	}
	function sd(a, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		var x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0;
		x = i;
		y = (m | 0) > 0 ? m : 0;
		I = c[a + 8 >> 2] | 0;
		m = (y | 0) > 7 ? 8 : 0;
		y = y - m | 0;
		if ((r | 0) == 2 ? (A = d[21136 + (f - e) >> 0] | 0, (A | 0) <= (y | 0)) : 0) {
			y = y - A | 0;
			z = (y | 0) > 7 ? 8 : 0;
			y = y - z | 0
		} else {
			z = 0;
			A = 0
		}
		F = i;
		i = i + ((4 * I | 0) + 15 & -16) | 0;
		D = i;
		i = i + ((4 * I | 0) + 15 & -16) | 0;
		E = i;
		i = i + ((4 * I | 0) + 15 & -16) | 0;
		C = i;
		i = i + ((4 * I | 0) + 15 & -16) | 0;
		J = r << 3;
		B = a + 32 | 0;
		j = j + -5 - s | 0;
		H = s + 3 | 0;
		G = e;
		while (1) {
			if ((G | 0) >= (f | 0)) break;
			Q = G + 1 | 0;
			O = c[B >> 2] | 0;
			O = (b[O + (Q << 1) >> 1] | 0) - (b[O + (G << 1) >> 1] | 0) | 0;
			P = O * 3 << s << 3 >> 4;
			c[E + (G << 2) >> 2] = (J | 0) > (P | 0) ? J : P;
			P = ($($($(O, r) | 0, j) | 0, f - G + -1 | 0) | 0) << H >> 6;
			c[C + (G << 2) >> 2] = (O << s | 0) == 1 ? P - J | 0 : P;
			G = Q
		}
		G = c[a + 48 >> 2] | 0;
		j = a + 52 | 0;
		K = G + -1 | 0;
		H = 1;
		do {
			L = H + K >> 1;
			M = $(L, I) | 0;
			N = 1;
			P = f;
			O = 0;
			a: while (1) {
				b: while (1) {
					do {
						Q = P;
						P = P + -1 | 0;
						if ((Q | 0) <= (e | 0)) break a;
						R = c[B >> 2] | 0;
						Q = $((b[R + (Q << 1) >> 1] | 0) - (b[R + (P << 1) >> 1] | 0) | 0, r) | 0;
						Q = ($(Q, d[(c[j >> 2] | 0) + (M + P) >> 0] | 0) | 0) << s >> 2;
						if ((Q | 0) > 0) {
							Q = Q + (c[C + (P << 2) >> 2] | 0) | 0;
							Q = (Q | 0) < 0 ? 0 : Q
						}
						Q = Q + (c[g + (P << 2) >> 2] | 0) | 0;
						if ((Q | 0) < (c[E + (P << 2) >> 2] | 0) ^ 1 | N ^ 1) break b
					} while ((Q | 0) < (J | 0));
					O = O + J | 0
				}
				R = c[h + (P << 2) >> 2] | 0;
				N = 0;
				O = O + ((Q | 0) < (R | 0) ? Q : R) | 0
			}
			R = (O | 0) > (y | 0);
			K = R ? L + -1 | 0 : K;
			H = R ? H : L + 1 | 0
		}
		while ((H | 0) <= (K | 0));
		L = H + -1 | 0;
		J = $(L, I) | 0;
		N = $(H, I) | 0;
		L = (L | 0) > 0;
		I = e;
		K = e;
		while (1) {
			if ((K | 0) >= (f | 0)) break;
			M = K + 1 | 0;
			Q = c[B >> 2] | 0;
			Q = $((b[Q + (M << 1) >> 1] | 0) - (b[Q + (K << 1) >> 1] | 0) | 0, r) | 0;
			P = c[j >> 2] | 0;
			O = ($(Q, d[P + (J + K) >> 0] | 0) | 0) << s >> 2;
			if ((H | 0) < (G | 0)) P = ($(Q, d[P + (N + K) >> 0] | 0) | 0) << s >> 2;
			else P = c[h + (K << 2) >> 2] | 0;
			if ((O | 0) > 0) {
				O = O + (c[C + (K << 2) >> 2] | 0) | 0;
				O = (O | 0) < 0 ? 0 : O
			}
			if ((P | 0) > 0) {
				P = P + (c[C + (K << 2) >> 2] | 0) | 0;
				P = (P | 0) < 0 ? 0 : P
			}
			R = c[g + (K << 2) >> 2] | 0;
			O = L ? O + R | 0 : O;
			Q = P + R - O | 0;
			c[F + (K << 2) >> 2] = O;
			c[D + (K << 2) >> 2] = (Q | 0) < 0 ? 0 : Q;
			I = (R | 0) > 0 ? K : I;
			K = M
		}
		R = td(a, e, f, I, F, D, E, h, y, n, m, k, A, l, z, o, p, q, r, s, t, u, v, w) | 0;
		i = x;
		return R | 0
	}
	function td(a, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		x = x | 0;
		y = y | 0;
		z = z | 0;
		A = A | 0;
		B = B | 0;
		var C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0;
		D = i;
		E = w << 3;
		G = (w | 0) > 1;
		C = G & 1;
		F = x << 3;
		J = 64;
		I = 0;
		K = 0;
		while (1) {
			if ((K | 0) >= 6) {
				K = 0;
				M = f;
				L = 0;
				break
			}
			M = I + J >> 1;
			L = 1;
			P = f;
			N = 0;
			a: while (1) {
				b: while (1) {
					do {
						O = P;
						P = P + -1 | 0;
						if ((O | 0) <= (e | 0)) break a;
						O = (c[h + (P << 2) >> 2] | 0) + (($(M, c[j + (P << 2) >> 2] | 0) | 0) >> 6) | 0;
						if ((O | 0) < (c[k + (P << 2) >> 2] | 0) ^ 1 | L ^ 1) break b
					} while ((O | 0) < (E | 0));
					N = N + E | 0
				}
				Q = c[l + (P << 2) >> 2] | 0;
				L = 0;
				N = N + ((O | 0) < (Q | 0) ? O : Q) | 0
			}
			Q = (N | 0) > (m | 0);
			J = Q ? M : J;
			I = Q ? I : M;
			K = K + 1 | 0
		}
		while (1) {
			J = M + -1 | 0;
			if ((M | 0) <= (e | 0)) break;
			M = (c[h + (J << 2) >> 2] | 0) + (($(I, c[j + (J << 2) >> 2] | 0) | 0) >> 6) | 0;
			if ((K | 0) == 0 ? (M | 0) < (c[k + (J << 2) >> 2] | 0) : 0) {
				K = 0;
				M = (M | 0) < (E | 0) ? 0 : E
			} else K = 1;
			Q = c[l + (J << 2) >> 2] | 0;
			Q = (M | 0) < (Q | 0) ? M : Q;
			c[t + (J << 2) >> 2] = Q;
			M = J;
			L = L + Q | 0
		}
		h = a + 32 | 0;
		j = E + 8 | 0;
		z = (z | 0) == 0;
		K = e + 2 | 0;
		J = q;
		I = L;
		q = f;
		while (1) {
			M = q + -1 | 0;
			if ((M | 0) <= (g | 0)) {
				H = 18;
				break
			}
			R = m - I | 0;
			O = c[h >> 2] | 0;
			L = b[O + (q << 1) >> 1] | 0;
			N = b[O + (e << 1) >> 1] | 0;
			P = L - N | 0;
			Q = ud(R, P) | 0;
			P = R - ($(P, Q) | 0) | 0;
			O = b[O + (M << 1) >> 1] | 0;
			N = P + (N - O) | 0;
			O = L - O | 0;
			L = t + (M << 2) | 0;
			P = c[L >> 2] | 0;
			N = P + ($(Q, O) | 0) + ((N | 0) > 0 ? N : 0) | 0;
			Q = c[k + (M << 2) >> 2] | 0;
			if ((N | 0) < (((Q | 0) > (j | 0) ? Q : j) | 0)) q = P;
			else {
				if (z) {
					if (rc(y, 1) | 0) break
				} else {
					if ((q | 0) <= (K | 0)) {
						H = 23;
						break
					}
					if (!((M | 0) > (B | 0) ? 1 : (N | 0) <= (($((q | 0) <= (A | 0) ? 7 : 9, O) | 0) << x << 3 >> 4 | 0))) {
						H = 23;
						break
					}
					Bc(y, 0, 1)
				}
				q = c[L >> 2] | 0;
				N = N + -8 | 0;
				I = I + 8 | 0
			}
			if ((J | 0) > 0) O = d[21136 + (M - e) >> 0] | 0;
			else O = J;
			I = I - (q + J) + O | 0;
			q = (N | 0) < (E | 0);
			c[L >> 2] = q ? 0 : E;
			J = O;
			I = q ? I : I + E | 0;
			q = M
		}
		if ((H | 0) == 18) m = m + o | 0;
		else if ((H | 0) == 23) Bc(y, 1, 1);
		do
		if ((J | 0) > 0) if (z) {
			k = (tc(y, q + 1 - e | 0) | 0) + e | 0;
			c[p >> 2] = k;
			break
		} else {
			k = c[p >> 2] | 0;
			k = (k | 0) < (q | 0) ? k : q;
			c[p >> 2] = k;
			Dc(y, k - e | 0, q + 1 - e | 0);
			k = c[p >> 2] | 0;
			break
		} else {
			c[p >> 2] = 0;
			k = 0
		}
		while (0);
		do
		if ((k | 0) > (e | 0)) if ((s | 0) > 0) if (z) {
			c[r >> 2] = rc(y, 1) | 0;
			break
		} else {
			Bc(y, c[r >> 2] | 0, 1);
			break
		} else H = 41;
		else {
			m = m + s | 0;
			H = 41
		}
		while (0);
		if ((H | 0) == 41) c[r >> 2] = 0;
		H = m - I | 0;
		y = c[h >> 2] | 0;
		y = (b[y + (q << 1) >> 1] | 0) - (b[y + (e << 1) >> 1] | 0) | 0;
		s = ud(H, y) | 0;
		y = H - ($(y, s) | 0) | 0;
		H = e;
		while (1) {
			if ((H | 0) >= (q | 0)) {
				H = e;
				break
			}
			R = H + 1 | 0;
			P = c[h >> 2] | 0;
			P = $(s, (b[P + (R << 1) >> 1] | 0) - (b[P + (H << 1) >> 1] | 0) | 0) | 0;
			Q = t + (H << 2) | 0;
			c[Q >> 2] = (c[Q >> 2] | 0) + P;
			H = R
		}
		while (1) {
			if ((H | 0) >= (q | 0)) break;
			R = H + 1 | 0;
			Q = c[h >> 2] | 0;
			Q = (b[Q + (R << 1) >> 1] | 0) - (b[Q + (H << 1) >> 1] | 0) | 0;
			Q = (y | 0) < (Q | 0) ? y : Q;
			P = t + (H << 2) | 0;
			c[P >> 2] = (c[P >> 2] | 0) + Q;
			y = y - Q | 0;
			H = R
		}
		H = (w | 0) == 2;
		a = a + 56 | 0;
		y = G ? 4 : 3;
		G = 0;
		while (1) {
			if ((e | 0) >= (q | 0)) break;
			s = e + 1 | 0;
			g = c[h >> 2] | 0;
			g = (b[g + (s << 1) >> 1] | 0) - (b[g + (e << 1) >> 1] | 0) << x;
			B = t + (e << 2) | 0;
			A = (c[B >> 2] | 0) + G | 0;
			if ((g | 0) > 1) {
				k = A - (c[l + (e << 2) >> 2] | 0) | 0;
				k = (k | 0) > 0 ? k : 0;
				m = A - k | 0;
				c[B >> 2] = m;
				o = $(g, w) | 0;
				if (H & (g | 0) > 2 ? (c[r >> 2] | 0) == 0 : 0) A = (e | 0) < (c[p >> 2] | 0);
				else A = 0;
				A = o + (A & 1) | 0;
				o = $(A, (b[(c[a >> 2] | 0) + (e << 1) >> 1] | 0) + F | 0) | 0;
				z = (o >> 1) + ($(A, -21) | 0) | 0;
				if ((g | 0) == 2) g = z + (A << 3 >> 2) | 0;
				else g = z;
				z = m + g | 0;
				if ((z | 0) >= (A << 4 | 0)) {
					if ((z | 0) < (A * 24 | 0)) g = g + (o >> 3) | 0
				} else g = g + (o >> 2) | 0;
				o = m + g + (A << 2) | 0;
				m = u + (e << 2) | 0;
				o = (ud((o | 0) < 0 ? 0 : o, A) | 0) >>> 3;
				c[m >> 2] = o;
				R = $(o, w) | 0;
				z = c[B >> 2] | 0;
				if ((R | 0) > (z >> 3 | 0)) {
					o = z >> C >> 3;
					c[m >> 2] = o
				}
				R = (o | 0) < 8 ? o : 8;
				c[m >> 2] = R;
				R = $(R, A << 3) | 0;
				c[v + (e << 2) >> 2] = (R | 0) >= ((c[B >> 2] | 0) + g | 0) & 1;
				R = ($(c[m >> 2] | 0, w) | 0) << 3;
				c[B >> 2] = (c[B >> 2] | 0) - R
			} else {
				k = A - E | 0;
				k = (k | 0) < 0 ? 0 : k;
				c[B >> 2] = A - k;
				c[u + (e << 2) >> 2] = 0;
				c[v + (e << 2) >> 2] = 1
			}
			if ((k | 0) <= 0) {
				G = k;
				e = s;
				continue
			}
			O = k >> y;
			Q = u + (e << 2) | 0;
			P = c[Q >> 2] | 0;
			R = 8 - P | 0;
			R = (O | 0) < (R | 0) ? O : R;
			c[Q >> 2] = P + R;
			R = ($(R, w) | 0) << 3;
			c[v + (e << 2) >> 2] = (R | 0) >= (k - G | 0) & 1;
			G = k - R | 0;
			e = s
		}
		c[n >> 2] = G;
		while (1) {
			if ((e | 0) >= (f | 0)) break;
			Q = t + (e << 2) | 0;
			R = u + (e << 2) | 0;
			c[R >> 2] = c[Q >> 2] >> C >> 3;
			c[Q >> 2] = 0;
			c[v + (e << 2) >> 2] = (c[R >> 2] | 0) < 1 & 1;
			e = e + 1 | 0
		}
		i = D;
		return q | 0
	}
	function ud(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function vd(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0,
			v = 0.0,
			w = 0;
		k = i;
		m = i;
		i = i + ((4 * b | 0) + 15 & -16) | 0;
		j = i;
		i = i + ((4 * b | 0) + 15 & -16) | 0;
		l = i;
		i = i + ((4 * b | 0) + 15 & -16) | 0;
		wd(a, b, 1, f, d, e);
		e = 0;
		do {
			n = a + (e << 2) | 0;
			o = +g[n >> 2];
			p = l + (e << 2) | 0;
			if (o > 0.0) g[p >> 2] = 1.0;
			else {
				g[p >> 2] = -1.0;
				g[n >> 2] = -o
			}
			c[j + (e << 2) >> 2] = 0;
			g[m + (e << 2) >> 2] = 0.0;
			e = e + 1 | 0
		} while ((e | 0) < (b | 0));
		if ((b >> 1 | 0) < (d | 0)) {
			e = 0;
			o = 0.0;
			do {
				o = o + +g[a + (e << 2) >> 2];
				e = e + 1 | 0
			} while ((e | 0) < (b | 0));
			if (!(o > 1.0000000036274937e-15 & o < 64.0)) {
				g[a >> 2] = 1.0;
				e = 1;
				do {
					g[a + (e << 2) >> 2] = 0.0;
					e = e + 1 | 0
				} while ((e | 0) < (b | 0));
				o = 1.0
			}
			r = +(d + -1 | 0) * (1.0 / o);
			n = 0;
			e = d;
			o = 0.0;
			q = 0.0;
			do {
				t = +g[a + (n << 2) >> 2];
				w = ~~ + N(+(r * t));
				c[j + (n << 2) >> 2] = w;
				v = +(w | 0);
				q = q + v * v;
				o = o + t * v;
				g[m + (n << 2) >> 2] = v * 2.0;
				e = e - w | 0;
				n = n + 1 | 0
			} while ((n | 0) < (b | 0))
		} else {
			e = d;
			o = 0.0;
			q = 0.0
		}
		if ((e | 0) > (b + 3 | 0)) {
			v = +(e | 0);
			q = q + v * v + v * +g[m >> 2];
			c[j >> 2] = (c[j >> 2] | 0) + e;
			e = 0
		}
		n = 0;
		while (1) {
			if ((n | 0) >= (e | 0)) {
				m = 0;
				break
			}
			s = q + 1.0;
			r = 0.0;
			w = 0;
			q = -999999986991104.0;
			p = 0;
			while (1) {
				v = o + +g[a + (p << 2) >> 2];
				t = s + +g[m + (p << 2) >> 2];
				v = v * v;
				u = r * v > t * q;
				w = u ? p : w;
				p = p + 1 | 0;
				if ((p | 0) >= (b | 0)) break;
				else {
					r = u ? t : r;
					q = u ? v : q
				}
			}
			v = o + +g[a + (w << 2) >> 2];
			u = m + (w << 2) | 0;
			q = +g[u >> 2];
			g[u >> 2] = q + 2.0;
			w = j + (w << 2) | 0;
			c[w >> 2] = (c[w >> 2] | 0) + 1;
			n = n + 1 | 0;
			o = v;
			q = s + q
		}
		do {
			v = +g[l + (m << 2) >> 2];
			w = a + (m << 2) | 0;
			g[w >> 2] = v * +g[w >> 2];
			if (v < 0.0) {
				w = j + (m << 2) | 0;
				c[w >> 2] = 0 - (c[w >> 2] | 0)
			}
			m = m + 1 | 0
		} while ((m | 0) < (b | 0));
		fc(j, b, d, h);
		w = xd(j, b, f) | 0;
		i = k;
		return w | 0
	}
	function wd(a, b, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0.0,
			k = 0.0,
			l = 0.0,
			m = 0.0,
			n = 0,
			o = 0;
		h = i;
		if ((f << 1 | 0) >= (b | 0) | (g | 0) == 0) {
			i = h;
			return
		}
		k = +(b | 0) / +(($(c[21160 + (g + -1 << 2) >> 2] | 0, f) | 0) + b | 0);
		k = k * k * .5;
		j = +R(+(k * 1.5707963705062866));
		k = +R(+((1.0 - k) * 1.5707963705062866));
		a: do
		if ((e << 3 | 0) > (b | 0)) g = 0;
		else {
			f = e >> 2;
			g = 1;
			while (1) {
				if ((($(($(g, g) | 0) + g | 0, e) | 0) + f | 0) >= (b | 0)) break a;
				g = g + 1 | 0
			}
		}
		while (0);
		b = Dd(b, e) | 0;
		d = (d | 0) < 0;
		n = (g | 0) == 0;
		m = -k;
		l = -j;
		o = 0;
		while (1) {
			if ((o | 0) >= (e | 0)) break;
			f = a + (($(o, b) | 0) << 2) | 0;
			if (!d) {
				Ed(f, b, 1, j, m);
				if (!n) Ed(f, b, g, k, l)
			} else {
				if (!n) Ed(f, b, g, k, j);
				Ed(f, b, 1, j, k)
			}
			o = o + 1 | 0
		}
		i = h;
		return
	}
	function xd(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		e = i;
		if ((d | 0) < 2) {
			k = 1;
			i = e;
			return k | 0
		}
		b = Dd(b, d) | 0;
		g = 0;
		f = 0;
		do {
			h = $(f, b) | 0;
			j = 0;
			k = 0;
			do {
				k = k | c[a + (h + j << 2) >> 2];
				j = j + 1 | 0
			} while ((j | 0) < (b | 0));
			g = g | ((k | 0) != 0 & 1) << f;
			f = f + 1 | 0
		} while ((f | 0) < (d | 0));
		i = e;
		return g | 0
	}
	function yd(a, b, c, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = +g;
		var h = 0,
			j = 0;
		h = i;
		j = i;
		i = i + ((4 * b | 0) + 15 & -16) | 0;
		zd(j, a, b, +hc(j, b, c, f), g);
		wd(a, b, -1, e, c, d);
		f = xd(j, b, e) | 0;
		i = h;
		return f | 0
	}
	function zd(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = +e;
		f = +f;
		var h = 0,
			j = 0;
		h = i;
		f = 1.0 / +P(+e) * f;
		j = 0;
		do {
			g[b + (j << 2) >> 2] = f * +(c[a + (j << 2) >> 2] | 0);
			j = j + 1 | 0
		} while ((j | 0) < (d | 0));
		i = h;
		return
	}
	function Ad(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = d | 0;
		var e = 0;
		d = i;
		c = 1.0 / +P(+(+Bd(a, a, b) + 1.0000000036274937e-15)) * c;
		e = 0;
		while (1) {
			if ((e | 0) >= (b | 0)) break;
			g[a >> 2] = c * +g[a >> 2];
			e = e + 1 | 0;
			a = a + 4 | 0
		}
		i = d;
		return
	}
	function Bd(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		f = 0;
		e = 0.0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			h = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = h
		}
		i = d;
		return +e
	}
	function Cd(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0.0,
			l = 0.0;
		e = i;
		a: do
		if (!c) {
			h = +Bd(a, a, d) + 1.0000000036274937e-15;
			f = +Bd(b, b, d) + 1.0000000036274937e-15
		} else {
			h = 1.0000000036274937e-15;
			f = 1.0000000036274937e-15;
			c = 0;
			while (1) {
				if ((c | 0) >= (d | 0)) break a;
				l = +g[a + (c << 2) >> 2];
				j = +g[b + (c << 2) >> 2];
				k = l + j;
				j = l - j;
				h = h + k * k;
				f = f + j * j;
				c = c + 1 | 0
			}
		}
		while (0);
		c = ~~ + N(+(+X(+(+P(+f)), +(+P(+h))) * 10430.3818359375 + .5));
		i = e;
		return c | 0
	}
	function Dd(a, b) {
		a = a | 0;
		b = b | 0;
		return (a >>> 0) / (b >>> 0) | 0 | 0
	}
	function Ed(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = +d;
		e = +e;
		var f = 0.0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0.0,
			o = 0;
		h = i;
		f = -e;
		k = b - c | 0;
		l = a;
		j = 0;
		while (1) {
			if ((j | 0) >= (k | 0)) break;
			n = +g[l >> 2];
			o = l + (c << 2) | 0;
			m = +g[o >> 2];
			g[o >> 2] = m * d + n * e;
			g[l >> 2] = n * d + m * f;
			l = l + 4 | 0;
			j = j + 1 | 0
		}
		b = b - (c << 1) | 0;
		j = a + (b + -1 << 2) | 0;
		while (1) {
			if ((b | 0) <= 0) break;
			m = +g[j >> 2];
			o = j + (c << 2) | 0;
			n = +g[o >> 2];
			g[o >> 2] = n * d + m * e;
			g[j >> 2] = m * d + n * f;
			j = j + -4 | 0;
			b = b + -1 | 0
		}
		i = h;
		return
	}
	function Fd(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0;
		f = i;
		i = i + 80 | 0;
		l = f + 44 | 0;
		j = f + 8 | 0;
		m = f;
		c[m >> 2] = l;
		c[m + 4 >> 2] = j;
		h = e >> 1;
		Gd(d, l, j, h);
		w = Hd(l, 8192, h) | 0;
		if ((w | 0) < 0) {
			b[a >> 1] = 0;
			g = 0;
			o = j;
			n = 1;
			w = Hd(j, 8192, h) | 0
		} else {
			g = 0;
			o = l;
			n = 0
		}
		a: while (1) {
			r = 1;
			q = 0;
			u = 8192;
			b: while (1) {
				p = r;
				while (1) {
					t = b[21992 + (p << 1) >> 1] | 0;
					v = Hd(o, t, h) | 0;
					if ((w | 0) < 1) {
						if ((v | 0) >= (q | 0)) break;
						if ((w | 0) > -1) k = 8
					} else k = 8;
					if ((k | 0) == 8 ? (k = 0, (v | 0) <= (0 - q | 0)) : 0) break;
					if ((p | 0) > 127) break b;
					else {
						p = p + 1 | 0;
						q = 0;
						u = t;
						w = v
					}
				}
				q = (v | 0) == 0 ? 1 : 0;
				r = -256;
				s = 0;
				while (1) {
					if ((s | 0) >= 3) break;
					y = u + t | 0;
					y = (y >> 1) + (y & 1) | 0;
					x = Hd(o, y, h) | 0;
					if ((w | 0) < 1) if ((x | 0) <= -1 ? !((w | 0) > -1 & (x | 0) < 1) : 0) k = 15;
					else {
						t = y;
						v = x
					} else if ((x | 0) < 1) {
						t = y;
						v = x
					} else k = 15;
					if ((k | 0) == 15) {
						k = 0;
						r = r + (128 >>> s) | 0;
						u = y;
						w = x
					}
					s = s + 1 | 0
				}
				o = w - v | 0;
				if ((((w | 0) > 0 ? w : 0 - w | 0) | 0) < 65536) {
					if ((w | 0) != (v | 0)) r = r + (((w << 5) + (o >> 1) | 0) / (o | 0) | 0) | 0
				} else r = r + ((w | 0) / (o >> 5 | 0) | 0) | 0;
				b[a + (n << 1) >> 1] = Id((p << 8) + r | 0) | 0;
				s = n + 1 | 0;
				if ((s | 0) >= (e | 0)) {
					k = 30;
					break a
				}
				r = p;
				o = c[m + ((s & 1) << 2) >> 2] | 0;
				n = s;
				u = b[21992 + (p + -1 << 1) >> 1] | 0;
				w = 1 - (s & 2) << 12
			}
			n = g + 1 | 0;
			if ((g | 0) > 29) break;
			w = n << 16;
			jf(d, e, 65536 - ($(w + 655360 >> 16, w >> 16) | 0) | 0);
			Gd(d, l, j, h);
			w = Hd(l, 8192, h) | 0;
			if ((w | 0) >= 0) {
				g = n;
				o = l;
				n = 0;
				continue
			}
			b[a >> 1] = 0;
			g = n;
			o = j;
			n = 1;
			w = Hd(j, 8192, h) | 0
		}
		if ((k | 0) == 30) {
			i = f;
			return
		}
		b[a >> 1] = 32768 / (e + 1 | 0) | 0;
		g = 1;
		while (1) {
			if ((g | 0) >= (e | 0)) break;
			b[a + (g << 1) >> 1] = $((g << 16) + 65536 >> 16, b[a >> 1] | 0) | 0;
			g = g + 1 | 0
		}
		i = f;
		return
	}
	function Gd(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0;
		f = i;
		c[b + (e << 2) >> 2] = 65536;
		c[d + (e << 2) >> 2] = 65536;
		g = 0;
		while (1) {
			if ((g | 0) >= (e | 0)) {
				g = e;
				break
			}
			h = a + (e - g + -1 << 2) | 0;
			j = a + (g + e << 2) | 0;
			c[b + (g << 2) >> 2] = 0 - (c[h >> 2] | 0) - (c[j >> 2] | 0);
			c[d + (g << 2) >> 2] = (c[j >> 2] | 0) - (c[h >> 2] | 0);
			g = g + 1 | 0
		}
		while (1) {
			if ((g | 0) <= 0) break;
			j = g + -1 | 0;
			h = b + (j << 2) | 0;
			c[h >> 2] = (c[h >> 2] | 0) - (c[b + (g << 2) >> 2] | 0);
			h = d + (j << 2) | 0;
			c[h >> 2] = (c[h >> 2] | 0) + (c[d + (g << 2) >> 2] | 0);
			g = j
		}
		Jd(b, e);
		Jd(d, e);
		i = f;
		return
	}
	function Hd(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0;
		e = i;
		f = c[a + (d << 2) >> 2] | 0;
		g = b << 4;
		if ((d | 0) == 8 | 0) {
			b = b << 20 >> 16;
			h = (g >> 15) + 1 >> 1;
			d = (c[a + 28 >> 2] | 0) + (($(f >> 16, b) | 0) + (($(f & 65535, b) | 0) >> 16)) + ($(f, h) | 0) | 0;
			d = (c[a + 24 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			d = (c[a + 20 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			d = (c[a + 16 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			d = (c[a + 12 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			d = (c[a + 8 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			d = (c[a + 4 >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			h = (c[a >> 2] | 0) + (($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16)) + ($(d, h) | 0) | 0;
			i = e;
			return h | 0
		}
		b = b << 20 >> 16;
		g = (g >> 15) + 1 >> 1;
		while (1) {
			h = d + -1 | 0;
			if ((d | 0) <= 0) break;
			d = h;
			f = (c[a + (h << 2) >> 2] | 0) + (($(f >> 16, b) | 0) + (($(f & 65535, b) | 0) >> 16)) + ($(f, g) | 0) | 0
		}
		i = e;
		return f | 0
	}
	function Id(a) {
		a = a | 0;
		return ((a | 0) < 32767 ? a : 32767) | 0
	}
	function Jd(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		d = i;
		e = 2;
		while (1) {
			if ((e | 0) > (b | 0)) break;
			else f = b;
			while (1) {
				if ((f | 0) <= (e | 0)) break;
				g = a + (f + -2 << 2) | 0;
				c[g >> 2] = (c[g >> 2] | 0) - (c[a + (f << 2) >> 2] | 0);
				f = f + -1 | 0
			}
			g = a + (e + -2 << 2) | 0;
			c[g >> 2] = (c[g >> 2] | 0) - (c[a + (e << 2) >> 2] << 1);
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function Kd(a) {
		a = a | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		d = i;
		h = a + 2340 | 0;
		j = c[h >> 2] | 0;
		f = 32767 / (j + 1 | 0) | 0;
		e = 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (j | 0)) break;
			k = e + f | 0;
			b[a + (g << 1) + 4052 >> 1] = k;
			j = c[h >> 2] | 0;
			e = k;
			g = g + 1 | 0
		}
		c[a + 4148 >> 2] = 0;
		c[a + 4152 >> 2] = 3176576;
		i = d;
		return
	}
	function Ld(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0;
		g = i;
		i = i + 32 | 0;
		h = g;
		k = a + 2772 | 0;
		j = a + 2316 | 0;
		if ((c[j >> 2] | 0) != (c[a + 4156 >> 2] | 0)) {
			Kd(a);
			c[a + 4156 >> 2] = c[j >> 2]
		}
		j = a + 4160 | 0;
		do
		if (!(c[j >> 2] | 0)) {
			if (!(c[a + 4164 >> 2] | 0)) {
				m = a + 2340 | 0;
				l = 0;
				while (1) {
					if ((l | 0) >= (c[m >> 2] | 0)) break;
					A = b[a + (l << 1) + 2344 >> 1] | 0;
					C = a + (l << 1) + 4052 | 0;
					z = b[C >> 1] | 0;
					B = z & 65535;
					b[C >> 1] = B + ((((A << 16 >> 16) - (z << 16 >> 16) >> 16) * 16348 | 0) + ((((A & 65535) - B & 65535) * 16348 | 0) >>> 16));
					l = l + 1 | 0
				}
				l = a + 2324 | 0;
				o = c[l >> 2] | 0;
				p = 0;
				n = 0;
				m = 0;
				while (1) {
					if ((n | 0) >= (o | 0)) break;
					B = c[d + (n << 2) + 16 >> 2] | 0;
					A = (B | 0) > (p | 0);
					C = A ? n : m;
					p = A ? B : p;
					n = n + 1 | 0;
					m = C
				}
				n = a + 2332 | 0;
				C = c[n >> 2] | 0;
				zj(a + (C << 2) + 2772 | 0, k | 0, ($(o + -1 | 0, C) | 0) << 2 | 0) | 0;
				n = c[n >> 2] | 0;
				yj(k | 0, a + (($(m, n) | 0) << 2) + 4 | 0, n << 2 | 0) | 0;
				m = a + 4148 | 0;
				l = c[l >> 2] | 0;
				n = 0;
				while (1) {
					if ((n | 0) >= (l | 0)) break;
					B = c[m >> 2] | 0;
					C = (c[d + (n << 2) + 16 >> 2] | 0) - B | 0;
					c[m >> 2] = B + (((C >> 16) * 4634 | 0) + (((C & 65535) * 4634 | 0) >>> 16));
					n = n + 1 | 0
				}
				if (c[j >> 2] | 0) break
			}
			wj(a + 4084 | 0, 0, c[a + 2340 >> 2] << 2 | 0) | 0;
			i = g;
			return
		}
		while (0);
		d = ta() | 0;
		j = i;
		i = i + ((4 * (f + 16 | 0) | 0) + 15 & -16) | 0;
		C = b[a + 4224 >> 1] | 0;
		m = C << 16 >> 16;
		n = c[a + 4244 >> 2] | 0;
		l = n << 16 >> 16;
		n = ($(m >> 16, l) | 0) + (($(C & 65535, l) | 0) >> 16) + ($(m, (n >> 15) + 1 >> 1) | 0) | 0;
		m = c[a + 4148 >> 2] | 0;
		l = n >> 16;
		if ((n | 0) > 2097151 | (m | 0) > 8388608) {
			C = m >> 16;
			l = (Md(($(C, C) | 0) - (($(l, l) | 0) << 5) | 0) | 0) << 16
		} else {
			C = n << 16 >> 16;
			B = m << 16 >> 16;
			l = (Md(($(m >> 16, B) | 0) + (($(m & 65535, B) | 0) >> 16) + ($(m, (m >> 15) + 1 >> 1) | 0) - (($(l, C) | 0) + (($(n & 65535, C) | 0) >> 16) + ($(n, (n >> 15) + 1 >> 1) | 0) << 5) | 0) | 0) << 8
		}
		Nd(j + 64 | 0, k, l, f, a + 4152 | 0);
		k = a + 2340 | 0;
		Zd(h, a + 4052 | 0, c[k >> 2] | 0);
		a = a + 4084 | 0;
		m = j + 0 | 0;
		n = a + 0 | 0;
		l = m + 64 | 0;
		do {
			c[m >> 2] = c[n >> 2];
			m = m + 4 | 0;
			n = n + 4 | 0
		} while ((m | 0) < (l | 0));
		x = b[h >> 1] | 0;
		w = b[h + 2 >> 1] | 0;
		v = b[h + 4 >> 1] | 0;
		l = b[h + 6 >> 1] | 0;
		t = b[h + 8 >> 1] | 0;
		s = b[h + 10 >> 1] | 0;
		r = b[h + 12 >> 1] | 0;
		q = b[h + 14 >> 1] | 0;
		p = b[h + 16 >> 1] | 0;
		o = b[h + 18 >> 1] | 0;
		m = b[h + 20 >> 1] | 0;
		z = b[h + 22 >> 1] | 0;
		n = b[h + 24 >> 1] | 0;
		u = b[h + 26 >> 1] | 0;
		y = b[h + 28 >> 1] | 0;
		h = b[h + 30 >> 1] | 0;
		A = 0;
		while (1) {
			if ((A | 0) >= (f | 0)) break;
			C = c[j + (A + 15 << 2) >> 2] | 0;
			C = (c[k >> 2] >> 1) + (($(C >> 16, x) | 0) + (($(C & 65535, x) | 0) >> 16)) | 0;
			B = c[j + (A + 14 << 2) >> 2] | 0;
			B = C + (($(B >> 16, w) | 0) + (($(B & 65535, w) | 0) >> 16)) | 0;
			C = c[j + (A + 13 << 2) >> 2] | 0;
			C = B + (($(C >> 16, v) | 0) + (($(C & 65535, v) | 0) >> 16)) | 0;
			B = c[j + (A + 12 << 2) >> 2] | 0;
			B = C + (($(B >> 16, l) | 0) + (($(B & 65535, l) | 0) >> 16)) | 0;
			C = c[j + (A + 11 << 2) >> 2] | 0;
			C = B + (($(C >> 16, t) | 0) + (($(C & 65535, t) | 0) >> 16)) | 0;
			B = c[j + (A + 10 << 2) >> 2] | 0;
			B = C + (($(B >> 16, s) | 0) + (($(B & 65535, s) | 0) >> 16)) | 0;
			C = c[j + (A + 9 << 2) >> 2] | 0;
			C = B + (($(C >> 16, r) | 0) + (($(C & 65535, r) | 0) >> 16)) | 0;
			B = c[j + (A + 8 << 2) >> 2] | 0;
			B = C + (($(B >> 16, q) | 0) + (($(B & 65535, q) | 0) >> 16)) | 0;
			C = c[j + (A + 7 << 2) >> 2] | 0;
			C = B + (($(C >> 16, p) | 0) + (($(C & 65535, p) | 0) >> 16)) | 0;
			B = c[j + (A + 6 << 2) >> 2] | 0;
			B = C + (($(B >> 16, o) | 0) + (($(B & 65535, o) | 0) >> 16)) | 0;
			if ((c[k >> 2] | 0) == 16) {
				C = c[j + (A + 5 << 2) >> 2] | 0;
				C = B + (($(C >> 16, m) | 0) + (($(C & 65535, m) | 0) >> 16)) | 0;
				B = c[j + (A + 4 << 2) >> 2] | 0;
				B = C + (($(B >> 16, z) | 0) + (($(B & 65535, z) | 0) >> 16)) | 0;
				C = c[j + (A + 3 << 2) >> 2] | 0;
				C = B + (($(C >> 16, n) | 0) + (($(C & 65535, n) | 0) >> 16)) | 0;
				B = c[j + (A + 2 << 2) >> 2] | 0;
				B = C + (($(B >> 16, u) | 0) + (($(B & 65535, u) | 0) >> 16)) | 0;
				C = c[j + (A + 1 << 2) >> 2] | 0;
				C = B + (($(C >> 16, y) | 0) + (($(C & 65535, y) | 0) >> 16)) | 0;
				B = c[j + (A << 2) >> 2] | 0;
				B = C + (($(B >> 16, h) | 0) + (($(B & 65535, h) | 0) >> 16)) | 0
			}
			D = j + (A + 16 << 2) | 0;
			C = (c[D >> 2] | 0) + (B << 4) | 0;
			c[D >> 2] = C;
			B = e + (A << 1) | 0;
			C = (b[B >> 1] | 0) + ((C >> 9) + 1 >> 1) | 0;
			if ((C | 0) > 32767) C = 32767;
			else C = (C | 0) < -32768 ? -32768 : C & 65535;
			b[B >> 1] = C;
			A = A + 1 | 0
		}
		m = a + 0 | 0;
		n = j + (f << 2) + 0 | 0;
		l = m + 64 | 0;
		do {
			c[m >> 2] = c[n >> 2];
			m = m + 4 | 0;
			n = n + 4 | 0
		} while ((m | 0) < (l | 0));
		ja(d | 0);
		i = g;
		return
	}
	function Md(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		Od(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function Nd(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		h = i;
		g = 255;
		while (1) {
			if ((g | 0) <= (e | 0)) break;
			g = g >> 1
		}
		j = d << 12 >> 16;
		d = (d >> 19) + 1 >> 1;
		l = c[f >> 2] | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (e | 0)) break;
			l = ($(l, 196314165) | 0) + 907633515 | 0;
			m = c[b + ((l >> 24 & g) << 2) >> 2] | 0;
			m = ($(m >> 16, j) | 0) + (($(m & 65535, j) | 0) >> 16) + ($(m, d) | 0) | 0;
			if ((m | 0) <= 32767) if ((m | 0) < -32768) m = -32768;
			else m = m << 16 >> 16;
			else m = 32767;
			c[a + (k << 2) >> 2] = m;
			k = k + 1 | 0
		}
		c[f >> 2] = l;
		i = h;
		return
	}
	function Od(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = Pd(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (Qd(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function Pd(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Qd(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function Rd(b) {
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		d = i;
		if ((a[b + 4565 >> 0] | 0) != 2) {
			i = d;
			return
		}
		g = $(c[b + 4600 >> 2] | 0, 65536e3) | 0;
		g = (oh((g | 0) / (c[b + 4568 >> 2] | 0) | 0) | 0) + -2048 | 0;
		e = c[b + 4728 >> 2] | 0;
		h = 0 - e << 2;
		e = e << 16 >> 16;
		f = $(h >> 16, e) | 0;
		e = $(h & 65532, e) | 0;
		h = $(f + (e >> 16) >> 16, g - ((oh(3932160) | 0) + 63488) << 16 >> 16) | 0;
		g = g + (h + (($(f + (e >>> 16) & 65535, g - ((oh(3932160) | 0) + 63488) << 16 >> 16) | 0) >> 16)) | 0;
		e = b + 8 | 0;
		f = c[e >> 2] | 0;
		g = g - (f >> 8) | 0;
		if ((g | 0) < 0) g = g * 3 | 0;
		if ((g | 0) > 51) g = 51;
		else g = (g | 0) < -51 ? -51 : g;
		h = $(c[b + 4556 >> 2] << 16 >> 16, g << 16 >> 16) | 0;
		c[e >> 2] = f + (((h >> 16) * 6554 | 0) + (((h & 65535) * 6554 | 0) >>> 16));
		h = (oh(60) | 0) << 8;
		h = (h | 0) > ((oh(100) | 0) << 8 | 0);
		b = c[e >> 2] | 0;
		do
		if (h) {
			if ((b | 0) > ((oh(60) | 0) << 8 | 0)) {
				b = (oh(60) | 0) << 8;
				break
			}
			h = c[e >> 2] | 0;
			if ((h | 0) < ((oh(100) | 0) << 8 | 0)) {
				b = (oh(100) | 0) << 8;
				break
			} else {
				b = c[e >> 2] | 0;
				break
			}
		} else {
			if ((b | 0) > ((oh(100) | 0) << 8 | 0)) {
				b = (oh(100) | 0) << 8;
				break
			}
			h = c[e >> 2] | 0;
			if ((h | 0) < ((oh(60) | 0) << 8 | 0)) {
				b = (oh(60) | 0) << 8;
				break
			} else {
				b = c[e >> 2] | 0;
				break
			}
		}
		while (0);
		c[e >> 2] = b;
		i = d;
		return
	}



	function Sd(a, c, d, e, f, g) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0;
		l = i;
		g = d + 2 | 0;
		m = d + 4 | 0;
		k = d + 6 | 0;
		h = d + 8 | 0;
		n = d + 10 | 0;
		j = f;
		while (1) {
			if ((j | 0) >= (e | 0)) break;
			p = j + -1 | 0;
			o = $(b[c + (p << 1) >> 1] | 0, b[d >> 1] | 0) | 0;
			o = o + ($(b[c + (j + -2 << 1) >> 1] | 0, b[g >> 1] | 0) | 0) | 0;
			o = o + ($(b[c + (j + -3 << 1) >> 1] | 0, b[m >> 1] | 0) | 0) | 0;
			o = o + ($(b[c + (j + -4 << 1) >> 1] | 0, b[k >> 1] | 0) | 0) | 0;
			o = o + ($(b[c + (j + -5 << 1) >> 1] | 0, b[h >> 1] | 0) | 0) | 0;
			o = o + ($(b[c + (j + -6 << 1) >> 1] | 0, b[n >> 1] | 0) | 0) | 0;
			q = 6;
			while (1) {
				if ((q | 0) >= (f | 0)) break;
				r = o + ($(b[c + (p - q << 1) >> 1] | 0, b[d + (q << 1) >> 1] | 0) | 0) | 0;
				o = r + ($(b[c + (p + ~q << 1) >> 1] | 0, b[d + ((q | 1) << 1) >> 1] | 0) | 0) | 0;
				q = q + 2 | 0
			}
			o = ((b[c + (j << 1) >> 1] << 12) - o >> 11) + 1 >> 1;
			if ((o | 0) > 32767) o = 32767;
			else o = (o | 0) < -32768 ? -32768 : o & 65535;
			b[a + (j << 1) >> 1] = o;
			j = j + 1 | 0
		}
		wj(a | 0, 0, f << 1 | 0) | 0;
		i = l;
		return
	}
	function Td(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		e = i;
		i = i + 128 | 0;
		f = e;
		h = d & 1;
		g = 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (d | 0)) break;
			k = b[a + (j << 1) >> 1] | 0;
			c[f + (h << 6) + (j << 2) >> 2] = k << 12;
			g = g + k | 0;
			j = j + 1 | 0
		}
		if ((g | 0) > 4095) {
			k = 0;
			i = e;
			return k | 0
		}
		k = Ud(f, d) | 0;
		i = e;
		return k | 0
	}
	function Ud(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0;
		d = i;
		f = b & 1;
		l = 1073741824;
		k = 0;
		while (1) {
			b = b + -1 | 0;
			if ((b | 0) <= 0) break;
			g = c[a + (f << 6) + (b << 2) >> 2] | 0;
			if ((g | 0) > 16773022 | (g | 0) < -16773022) {
				a = 0;
				e = 13;
				break
			}
			j = 0 - (g << 7) | 0;
			h = ((j | 0) < 0) << 31 >> 31;
			Gj(j | 0, h | 0, j | 0, h | 0) | 0;
			o = 1073741824 - D | 0;
			m = 32 - (Vd((o | 0) > 0 ? o : 0 - o | 0) | 0) | 0;
			g = Wd(o, m + 30 | 0) | 0;
			k = Gj(l | 0, k | 0, o | 0, ((o | 0) < 0) << 31 >> 31 | 0) | 0;
			k = uj(k | 0, D | 0, 30) | 0;
			k = k & -4;
			l = b & 1;
			o = (m | 0) == 1;
			n = ((g | 0) < 0) << 31 >> 31;
			m = m + -1 | 0;
			p = 0;
			while (1) {
				if ((p | 0) >= (b | 0)) break;
				q = c[a + (f << 6) + (p << 2) >> 2] | 0;
				r = c[a + (f << 6) + (b - p + -1 << 2) >> 2] | 0;
				r = Gj(r | 0, ((r | 0) < 0) << 31 >> 31 | 0, j | 0, h | 0) | 0;
				r = uj(r | 0, D | 0, 30) | 0;
				r = xj(r | 0, D | 0, 1, 0) | 0;
				r = uj(r | 0, D | 0, 1) | 0;
				r = q - r | 0;
				r = Gj(r | 0, ((r | 0) < 0) << 31 >> 31 | 0, g | 0, n | 0) | 0;
				q = D;
				if (o) {
					q = uj(r | 0, q | 0, 1) | 0;
					q = xj(q | 0, D | 0, r & 1 | 0, 0) | 0
				} else {
					q = tj(r | 0, q | 0, m | 0) | 0;
					q = xj(q | 0, D | 0, 1, 0) | 0;
					q = uj(q | 0, D | 0, 1) | 0
				}
				c[a + (l << 6) + (p << 2) >> 2] = q;
				p = p + 1 | 0
			}
			f = l;
			l = k;
			k = ((k | 0) < 0) << 31 >> 31
		}
		if ((e | 0) == 13) {
			i = d;
			return a | 0
		}
		e = c[a + (f << 6) >> 2] | 0;
		if ((e | 0) > 16773022 | (e | 0) < -16773022) {
			r = 0;
			i = d;
			return r | 0
		}
		q = 0 - (e << 7) | 0;
		r = ((q | 0) < 0) << 31 >> 31;
		Gj(q | 0, r | 0, q | 0, r | 0) | 0;
		r = 1073741824 - D | 0;
		r = Gj(l | 0, k | 0, r | 0, ((r | 0) < 0) << 31 >> 31 | 0) | 0;
		r = uj(r | 0, D | 0, 30) | 0;
		r = r & -4;
		i = d;
		return r | 0
	}
	function Vd(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Wd(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		c = i;
		e = Vd((a | 0) > 0 ? a : 0 - a | 0) | 0;
		d = a << e + -1;
		h = d >> 16;
		a = 536870911 / (h | 0) | 0;
		g = a << 16;
		f = g >> 16;
		d = 536870912 - (($(h, f) | 0) + (($(d & 65535, f) | 0) >> 16)) << 3;
		a = g + (($(d >> 16, f) | 0) + (($(d & 65528, f) | 0) >> 16)) + ($(d, (a >> 15) + 1 >> 1) | 0) | 0;
		b = 62 - e - b | 0;
		if ((b | 0) >= 1) {
			i = c;
			return ((b | 0) < 32 ? a >> b : 0) | 0
		}
		b = 0 - b | 0;
		d = -2147483648 >> b;
		e = 2147483647 >>> b;
		if ((d | 0) > (e | 0)) {
			if ((a | 0) > (d | 0)) {
				h = d;
				h = h << b;
				i = c;
				return h | 0
			}
			h = (a | 0) < (e | 0) ? e : a;
			h = h << b;
			i = c;
			return h | 0
		} else {
			if ((a | 0) > (e | 0)) {
				h = e;
				h = h << b;
				i = c;
				return h | 0
			}
			h = (a | 0) < (d | 0) ? d : a;
			h = h << b;
			i = c;
			return h | 0
		}
		return 0
	}
	function Xd(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		e = i;
		i = i + 32 | 0;
		f = e + 8 | 0;
		g = e;
		j = a + 12 | 0;
		if (!(c[j >> 2] | 0)) {
			i = e;
			return
		}
		h = a + 8 | 0;
		l = 256 - (c[h >> 2] | 0) << 10;
		k = l >> 16;
		Yd(f, g, k, l - (k << 16) | 0);
		j = (c[h >> 2] | 0) + (c[j >> 2] | 0) | 0;
		if ((j | 0) > 256) j = 256;
		else j = (j | 0) < 0 ? 0 : j;
		c[h >> 2] = j;
		gf(b, f, g, a, b, d);
		i = e;
		return
	}
	function Yd(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		h = i;
		if ((d | 0) >= 4) {
			c[a + 0 >> 2] = c[6270];
			c[a + 4 >> 2] = c[6271];
			c[a + 8 >> 2] = c[6272];
			e = b;
			c[e >> 2] = 35497197;
			c[e + 4 >> 2] = 57401098;
			i = h;
			return
		}
		if ((e | 0) <= 0) {
			g = 25032 + (d * 12 | 0) | 0;
			c[a + 0 >> 2] = c[g + 0 >> 2];
			c[a + 4 >> 2] = c[g + 4 >> 2];
			c[a + 8 >> 2] = c[g + 8 >> 2];
			g = 25096 + (d << 3) | 0;
			a = c[g + 4 >> 2] | 0;
			e = b;
			c[e >> 2] = c[g >> 2];
			c[e + 4 >> 2] = a;
			i = h;
			return
		}
		f = d + 1 | 0;
		g = e << 16 >> 16;
		if ((e | 0) < 32768) {
			e = 0;
			while (1) {
				if ((e | 0) >= 3) {
					a = 0;
					break
				}
				k = c[25032 + (d * 12 | 0) + (e << 2) >> 2] | 0;
				j = (c[25032 + (f * 12 | 0) + (e << 2) >> 2] | 0) - k | 0;
				c[a + (e << 2) >> 2] = k + (($(j >> 16, g) | 0) + (($(j & 65535, g) | 0) >> 16));
				e = e + 1 | 0
			}
			while (1) {
				if ((a | 0) >= 2) break;
				j = c[25096 + (d << 3) + (a << 2) >> 2] | 0;
				k = (c[25096 + (f << 3) + (a << 2) >> 2] | 0) - j | 0;
				c[b + (a << 2) >> 2] = j + (($(k >> 16, g) | 0) + (($(k & 65535, g) | 0) >> 16));
				a = a + 1 | 0
			}
			i = h;
			return
		} else {
			e = 0;
			while (1) {
				if ((e | 0) >= 3) {
					a = 0;
					break
				}
				j = c[25032 + (f * 12 | 0) + (e << 2) >> 2] | 0;
				k = j - (c[25032 + (d * 12 | 0) + (e << 2) >> 2] | 0) | 0;
				c[a + (e << 2) >> 2] = j + (($(k >> 16, g) | 0) + (($(k & 65535, g) | 0) >> 16));
				e = e + 1 | 0
			}
			while (1) {
				if ((a | 0) >= 2) break;
				j = c[25096 + (f << 3) + (a << 2) >> 2] | 0;
				k = j - (c[25096 + (d << 3) + (a << 2) >> 2] | 0) | 0;
				c[b + (a << 2) >> 2] = j + (($(k >> 16, g) | 0) + (($(k & 65535, g) | 0) >> 16));
				a = a + 1 | 0
			}
			i = h;
			return
		}
	}
	function Zd(a, e, f) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		g = i;
		i = i + 208 | 0;
		l = g + 136 | 0;
		j = g + 100 | 0;
		k = g + 64 | 0;
		h = g;
		m = (f | 0) == 16 ? 21176 : 21192;
		n = 0;
		while (1) {
			if ((n | 0) >= (f | 0)) break;
			p = b[e + (n << 1) >> 1] | 0;
			o = p >> 8;
			q = b[21992 + (o << 1) >> 1] | 0;
			o = ((q << 8) + ($((b[21992 + (o + 1 << 1) >> 1] | 0) - q | 0, p - (o << 8) | 0) | 0) >> 3) + 1 >> 1;
			c[l + (d[m + n >> 0] << 2) >> 2] = o;
			n = n + 1 | 0
		}
		m = f >> 1;
		_d(j, l, m);
		_d(k, l + 4 | 0, m);
		l = 0;
		while (1) {
			if ((l | 0) >= (m | 0)) break;
			q = l + 1 | 0;
			p = (c[j + (q << 2) >> 2] | 0) + (c[j + (l << 2) >> 2] | 0) | 0;
			o = (c[k + (q << 2) >> 2] | 0) - (c[k + (l << 2) >> 2] | 0) | 0;
			c[h + (l << 2) >> 2] = 0 - o - p;
			c[h + (f - l + -1 << 2) >> 2] = o - p;
			l = q
		}
		k = 0;
		j = 0;
		while (1) {
			if ((j | 0) < 10) {
				l = 0;
				m = 0
			} else break;
			while (1) {
				if ((m | 0) >= (f | 0)) break;
				q = c[h + (m << 2) >> 2] | 0;
				q = (q | 0) > 0 ? q : 0 - q | 0;
				p = (q | 0) > (l | 0);
				k = p ? m : k;
				l = p ? q : l;
				m = m + 1 | 0
			}
			l = (l >> 4) + 1 >> 1;
			if ((l | 0) <= 32767) break;
			q = (l | 0) < 163838 ? l : 163838;
			jf(h, f, 65470 - (((q << 14) + -536854528 | 0) / (($(q, k + 1 | 0) | 0) >> 2 | 0) | 0) | 0);
			j = j + 1 | 0
		}
		a: do
		if ((j | 0) == 10) {
			k = 0;
			while (1) {
				if ((k | 0) >= (f | 0)) {
					k = 0;
					break a
				}
				j = h + (k << 2) | 0;
				l = (c[j >> 2] >> 4) + 1 >> 1;
				if ((l | 0) > 32767) l = 32767;
				else l = (l | 0) < -32768 ? -32768 : l & 65535;
				b[a + (k << 1) >> 1] = l;
				c[j >> 2] = l << 16 >> 16 << 5;
				k = k + 1 | 0
			}
		} else {
			j = 0;
			while (1) {
				if ((j | 0) >= (f | 0)) {
					k = 0;
					break a
				}
				b[a + (j << 1) >> 1] = (((c[h + (j << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
				j = j + 1 | 0
			}
		}
		while (0);
		while (1) {
			if ((k | 0) >= 16) {
				a = 26;
				break
			}
			if ((Td(a, f) | 0) >= 107374) {
				a = 26;
				break
			}
			jf(h, f, 65536 - (2 << k) | 0);
			j = 0;
			while (1) {
				if ((j | 0) >= (f | 0)) break;
				b[a + (j << 1) >> 1] = (((c[h + (j << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
				j = j + 1 | 0
			}
			k = k + 1 | 0
		}
		if ((a | 0) == 26) {
			i = g;
			return
		}
	}
	function _d(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		f = i;
		c[a >> 2] = 65536;
		e = a + 4 | 0;
		g = 1;
		h = 0 - (c[b >> 2] | 0) | 0;
		while (1) {
			c[e >> 2] = h;
			if ((g | 0) >= (d | 0)) break;
			j = c[b + (g << 1 << 2) >> 2] | 0;
			l = c[a + (g + -1 << 2) >> 2] | 0;
			k = ((j | 0) < 0) << 31 >> 31;
			m = c[a + (g << 2) >> 2] | 0;
			m = Gj(j | 0, k | 0, m | 0, ((m | 0) < 0) << 31 >> 31 | 0) | 0;
			m = uj(m | 0, D | 0, 15) | 0;
			m = xj(m | 0, D | 0, 1, 0) | 0;
			m = uj(m | 0, D | 0, 1) | 0;
			h = g + 1 | 0;
			c[a + (h << 2) >> 2] = (l << 1) - m;
			while (1) {
				if ((g | 0) <= 1) break;
				m = c[a + (g + -2 << 2) >> 2] | 0;
				o = Gj(j | 0, k | 0, l | 0, ((l | 0) < 0) << 31 >> 31 | 0) | 0;
				o = uj(o | 0, D | 0, 15) | 0;
				o = xj(o | 0, D | 0, 1, 0) | 0;
				o = uj(o | 0, D | 0, 1) | 0;
				n = a + (g << 2) | 0;
				c[n >> 2] = (c[n >> 2] | 0) + (m - o);
				l = m;
				g = g + -1 | 0
			}
			g = h;
			h = (c[e >> 2] | 0) - j | 0
		}
		i = f;
		return
	}
	function $d(a, b, f, g, h) {
		a = a | 0;
		b = b | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		j = i;
		k = 0;
		while (1) {
			if ((k | 0) < (g | 0)) {
				m = 0;
				l = 0
			} else break;
			while (1) {
				if ((m | 0) >= (h | 0)) break;
				o = (e[b + (m << 1) >> 1] | 0) - ((d[f >> 0] | 0) << 7) << 16 >> 16;
				o = $(o, o) | 0;
				n = (e[b + ((m | 1) << 1) >> 1] | 0) - ((d[f + 1 >> 0] | 0) << 7) << 16 >> 16;
				f = f + 2 | 0;
				m = m + 2 | 0;
				l = l + ((o + ($(n, n) | 0) | 0) >>> 4) | 0
			}
			c[a + (k << 2) >> 2] = l;
			k = k + 1 | 0
		}
		i = j;
		return
	}
	function ae(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		e = i;
		f = b[c >> 1] | 0;
		g = 131072 / (be(f) | 0) | 0;
		f = 131072 / (be((b[c + 2 >> 1] | 0) - f | 0) | 0) | 0;
		b[a >> 1] = ce(g + f | 0) | 0;
		d = d + -1 | 0;
		g = 1;
		while (1) {
			if ((g | 0) >= (d | 0)) break;
			k = g + 1 | 0;
			h = c + (k << 1) | 0;
			l = 131072 / (be((b[h >> 1] | 0) - (b[c + (g << 1) >> 1] | 0) | 0) | 0) | 0;
			b[a + (g << 1) >> 1] = ce(l + f | 0) | 0;
			j = g + 2 | 0;
			h = 131072 / (be((b[c + (j << 1) >> 1] | 0) - (b[h >> 1] | 0) | 0) | 0) | 0;
			b[a + (k << 1) >> 1] = ce(l + h | 0) | 0;
			g = j;
			f = h
		}
		b[a + (d << 1) >> 1] = ce((131072 / (be(32768 - (b[c + (d << 1) >> 1] | 0) | 0) | 0) | 0) + f | 0) | 0;
		i = e;
		return
	}
	function be(a) {
		a = a | 0;
		return ((a | 0) > 1 ? a : 1) | 0
	}
	function ce(a) {
		a = a | 0;
		return ((a | 0) < 32767 ? a : 32767) | 0
	}
	function de(f, g, h) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		m = i;
		i = i + 112 | 0;
		q = m + 96 | 0;
		n = m + 64 | 0;
		k = m + 32 | 0;
		l = m;
		j = h + 2 | 0;
		r = b[j >> 1] | 0;
		p = $(a[g >> 0] | 0, r << 16 >> 16) | 0;
		o = c[h + 8 >> 2] | 0;
		s = 0;
		while (1) {
			if ((s | 0) >= (r << 16 >> 16 | 0)) break;
			b[f + (s << 1) >> 1] = d[o + (p + s) >> 0] << 7;
			r = b[j >> 1] | 0;
			s = s + 1 | 0
		}
		se(n, q, h, a[g >> 0] | 0);
		ee(k, g + 1 | 0, q, b[h + 4 >> 1] | 0, b[j >> 1] | 0);
		ae(l, f, b[j >> 1] | 0);
		n = 0;
		while (1) {
			o = b[j >> 1] | 0;
			if ((n | 0) >= (o | 0)) break;
			p = fe(e[l + (n << 1) >> 1] << 16) | 0;
			o = f + (n << 1) | 0;
			p = (b[o >> 1] | 0) + ((b[k + (n << 1) >> 1] << 14 | 0) / (p | 0) | 0) | 0;
			if ((p | 0) > 32767) p = 32767;
			else p = (p | 0) < 0 ? 0 : p & 65535;
			b[o >> 1] = p;
			n = n + 1 | 0
		}
		pe(f, c[h + 32 >> 2] | 0, o);
		i = m;
		return
	}
	function ee(c, e, f, g, h) {
		c = c | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0;
		j = i;
		g = g << 16 >> 16;
		k = 0;
		l = h << 16 >> 16;
		while (1) {
			h = l + -1 | 0;
			if ((l | 0) <= 0) break;
			k = ($(k, d[f + h >> 0] | 0) | 0) >> 8;
			l = a[e + h >> 0] | 0;
			m = l << 24 >> 24 << 10;
			if (l << 24 >> 24 > 0) l = m + -102 | 0;
			else l = l << 24 >> 24 < 0 ? m | 102 : m;
			k = k + (($(l >> 16, g) | 0) + (($(l & 65535, g) | 0) >> 16)) | 0;
			b[c + (h << 1) >> 1] = k;
			k = k << 16 >> 16;
			l = h
		}
		i = j;
		return
	}
	function fe(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		ge(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function ge(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = he(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (ie(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function he(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function ie(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function je(e, f, g, h, j, k, l, m, n, o) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0;
		p = i;
		i = i + 320 | 0;
		u = p + 224 | 0;
		q = p + 256 | 0;
		x = p + 240 | 0;
		r = p + 192 | 0;
		t = p + 176 | 0;
		s = p + 160 | 0;
		w = p + 80 | 0;
		v = p;
		y = l << 16 >> 16;
		z = -10;
		while (1) {
			if ((z | 0) >= 10) break;
			A = z << 10;
			B = A + 1024 | 0;
			do
			if ((z | 0) <= 0) if ((z | 0) == -1) {
				l = A | 102;
				break
			} else if (!z) {
				l = A;
				B = A | 922;
				break
			} else {
				l = A | 102;
				B = A + 1126 | 0;
				break
			} else {
				l = A + -102 | 0;
				B = A | 922
			}
			while (0);
			J = z + 10 | 0;
			c[w + (J << 2) >> 2] = ($(l >> 16, y) | 0) + (($(l & 65535, y) | 0) >> 16);
			c[v + (J << 2) >> 2] = ($(B >> 16, y) | 0) + (($(B & 65535, y) | 0) >> 16);
			z = z + 1 | 0
		}
		c[r >> 2] = 0;
		b[x >> 1] = 0;
		o = o << 16 >> 16;
		l = m << 16 >> 16 >> 16;
		m = m & 65535;
		n = n << 16 >> 16;
		z = 1;
		y = o;
		a: while (1) {
			y = y + -1 | 0;
			B = b[j + (y << 1) >> 1] | 0;
			D = d[h + y >> 0] << 8;
			C = b[f + (y << 1) >> 1] | 0;
			E = g + (y << 1) | 0;
			A = 0;
			while (1) {
				if ((A | 0) >= (z | 0)) break;
				I = x + (A << 1) | 0;
				G = ($(D, b[I >> 1] | 0) | 0) >> 16;
				F = C - G << 16 >> 16;
				F = ($(l, F) | 0) + (($(m, F) | 0) >> 16) | 0;
				if ((F | 0) > 9) H = 9;
				else H = (F | 0) < -10 ? -10 : F;
				a[q + (A << 4) + y >> 0] = H;
				J = H + 10 | 0;
				F = (c[w + (J << 2) >> 2] | 0) + G | 0;
				G = (c[v + (J << 2) >> 2] | 0) + G | 0;
				b[I >> 1] = F;
				J = A + z | 0;
				b[x + (J << 1) >> 1] = G;
				do
				if ((H | 0) > 2) if ((H | 0) == 3) {
					I = d[k + (B + 7) >> 0] | 0;
					H = 280;
					break
				} else {
					H = (H << 16 >> 16) * 43 | 0;
					I = H + 108 | 0;
					H = H + 151 | 0;
					break
				} else {
					if ((H | 0) >= -3) {
						I = d[k + (B + (H + 4)) >> 0] | 0;
						H = d[k + (B + (H + 5)) >> 0] | 0;
						break
					}
					if ((H | 0) == -4) {
						I = 280;
						H = d[k + (B + 1) >> 0] | 0;
						break
					} else {
						H = $(H << 16 >> 16, -43) | 0;
						I = H + 108 | 0;
						H = H + 65 | 0;
						break
					}
				}
				while (0);
				L = r + (A << 2) | 0;
				K = c[L >> 2] | 0;
				M = C - F << 16 >> 16;
				M = $(M, M) | 0;
				F = b[E >> 1] | 0;
				c[L >> 2] = K + ($(M, F) | 0) + ($(n, I << 16 >> 16) | 0);
				I = C - G << 16 >> 16;
				c[r + (J << 2) >> 2] = K + ($($(I, I) | 0, F) | 0) + ($(n, H << 16 >> 16) | 0);
				A = A + 1 | 0
			}
			if ((z | 0) < 3) {
				A = 0;
				while (1) {
					if ((A | 0) >= (z | 0)) break;
					a[q + (A + z << 4) + y >> 0] = (d[q + (A << 4) + y >> 0] | 0) + 1;
					A = A + 1 | 0
				}
				z = z << 1;
				A = z;
				while (1) {
					if ((A | 0) >= 4) continue a;
					a[q + (A << 4) + y >> 0] = a[q + (A - z << 4) + y >> 0] | 0;
					A = A + 1 | 0
				}
			}
			if ((y | 0) > 0) C = 0;
			else {
				s = 0;
				h = 2147483647;
				t = 0;
				break
			}
			while (1) {
				if ((C | 0) >= 4) {
					B = 0;
					A = 0;
					E = 0;
					D = 2147483647;
					C = 0;
					break
				}
				E = r + (C << 2) | 0;
				D = c[E >> 2] | 0;
				F = C + 4 | 0;
				A = r + (F << 2) | 0;
				B = c[A >> 2] | 0;
				if ((D | 0) > (B | 0)) {
					c[s + (C << 2) >> 2] = D;
					c[t + (C << 2) >> 2] = B;
					c[E >> 2] = B;
					c[A >> 2] = D;
					K = x + (C << 1) | 0;
					L = b[K >> 1] | 0;
					M = x + (F << 1) | 0;
					b[K >> 1] = b[M >> 1] | 0;
					b[M >> 1] = L;
					c[u + (C << 2) >> 2] = F
				} else {
					c[t + (C << 2) >> 2] = D;
					c[s + (C << 2) >> 2] = B;
					c[u + (C << 2) >> 2] = C
				}
				C = C + 1 | 0
			}
			while (1) {
				if ((C | 0) < 4) {
					M = c[s + (C << 2) >> 2] | 0;
					L = (D | 0) > (M | 0);
					K = c[t + (C << 2) >> 2] | 0;
					J = (E | 0) < (K | 0);
					B = J ? C : B;
					A = L ? C : A;
					E = J ? K : E;
					D = L ? M : D;
					C = C + 1 | 0;
					continue
				}
				if ((D | 0) >= (E | 0)) {
					A = 0;
					break
				}
				c[u + (B << 2) >> 2] = c[u + (A << 2) >> 2] ^ 4;
				C = A + 4 | 0;
				c[r + (B << 2) >> 2] = c[r + (C << 2) >> 2];
				b[x + (B << 1) >> 1] = b[x + (C << 1) >> 1] | 0;
				c[t + (B << 2) >> 2] = 0;
				c[s + (A << 2) >> 2] = 2147483647;
				B = q + (B << 4) + 0 | 0;
				A = q + (A << 4) + 0 | 0;
				C = B + 16 | 0;
				do {
					a[B >> 0] = a[A >> 0] | 0;
					B = B + 1 | 0;
					A = A + 1 | 0
				} while ((B | 0) < (C | 0));
				B = 0;
				A = 0;
				E = 0;
				D = 2147483647;
				C = 0
			}
			while (1) {
				if ((A | 0) >= 4) continue a;
				M = q + (A << 4) + y | 0;
				a[M >> 0] = (d[M >> 0] | 0) + ((c[u + (A << 2) >> 2] | 0) >>> 2);
				A = A + 1 | 0
			}
		}
		while (1) {
			if ((t | 0) >= 8) break;
			M = c[r + (t << 2) >> 2] | 0;
			L = (h | 0) > (M | 0);
			s = L ? t : s;
			h = L ? M : h;
			t = t + 1 | 0
		}
		r = s & 3;
		t = 0;
		while (1) {
			if ((t | 0) >= (o | 0)) break;
			a[e + t >> 0] = a[q + (r << 4) + t >> 0] | 0;
			t = t + 1 | 0
		}
		a[e >> 0] = (d[e >> 0] | 0) + (s >>> 2);
		i = p;
		return h | 0
	}
	function ke(f, g, h, j, k, l, m) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0;
		r = i;
		i = i + 224 | 0;
		x = r;
		A = r + 168 | 0;
		u = r + 136 | 0;
		B = r + 104 | 0;
		z = r + 72 | 0;
		v = r + 40 | 0;
		t = r + 200 | 0;
		s = r + 8 | 0;
		q = h + 2 | 0;
		pe(g, c[h + 32 >> 2] | 0, b[q >> 1] | 0);
		o = b[h >> 1] | 0;
		D = i;
		i = i + ((4 * (o & 65535) | 0) + 15 & -16) | 0;
		C = h + 8 | 0;
		$d(D, g, c[C >> 2] | 0, o << 16 >> 16, b[q >> 1] | 0);
		o = i;
		i = i + ((4 * l | 0) + 15 & -16) | 0;
		Mh(D, o, b[h >> 1] | 0, l);
		D = i;
		i = i + ((4 * l | 0) + 15 & -16) | 0;
		p = i;
		i = i + ((1 * (l << 4) | 0) + 15 & -16) | 0;
		w = h + 28 | 0;
		n = h + 4 | 0;
		y = h + 6 | 0;
		E = m >> 1;
		G = h + 12 | 0;
		m = k << 14 >> 16;
		F = 0;
		while (1) {
			if ((F | 0) >= (l | 0)) break;
			H = c[o + (F << 2) >> 2] | 0;
			I = b[q >> 1] | 0;
			K = $(H, I) | 0;
			J = c[C >> 2] | 0;
			L = 0;
			while (1) {
				if ((L | 0) >= (I | 0)) break;
				M = d[J + (K + L) >> 0] << 7;
				b[B + (L << 1) >> 1] = M;
				b[A + (L << 1) >> 1] = (e[g + (L << 1) >> 1] | 0) - M;
				L = L + 1 | 0
			}
			ae(z, B, I);
			J = 0;
			while (1) {
				I = b[q >> 1] | 0;
				if ((J | 0) >= (I | 0)) {
					J = 0;
					break
				}
				M = le(e[z + (J << 1) >> 1] << 16) | 0;
				b[u + (J << 1) >> 1] = ($(b[A + (J << 1) >> 1] | 0, M << 16 >> 16) | 0) >>> 14;
				J = J + 1 | 0
			}
			while (1) {
				if ((J | 0) >= (I | 0)) break;
				b[v + (J << 1) >> 1] = (b[j + (J << 1) >> 1] << 5 | 0) / (b[z + (J << 1) >> 1] | 0) | 0;
				J = J + 1 | 0
			}
			se(s, t, h, H);
			J = je(p + (F << 4) | 0, u, v, t, s, c[w >> 2] | 0, b[n >> 1] | 0, b[y >> 1] | 0, k, b[q >> 1] | 0) | 0;
			I = D + (F << 2) | 0;
			c[I >> 2] = J;
			K = $(E, b[h >> 1] | 0) | 0;
			L = c[G >> 2] | 0;
			if (!H) H = 256 - (d[L + K >> 0] | 0) | 0;
			else H = (d[L + (K + (H + -1)) >> 0] | 0) - (d[L + (K + H) >> 0] | 0) | 0;
			c[I >> 2] = J + ($(1024 - (oh(H) | 0) << 16 >> 16, m) | 0);
			F = F + 1 | 0
		}
		Mh(D, x, l, 1);
		M = c[x >> 2] | 0;
		a[f >> 0] = c[o + (M << 2) >> 2];
		yj(f + 1 | 0, p + (M << 4) | 0, b[q >> 1] | 0) | 0;
		de(g, f, h);
		i = r;
		return
	}
	function le(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		me(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function me(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = ne(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (oe(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function ne(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function oe(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function pe(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		f = i;
		l = d + -1 | 0;
		g = a + (l << 1) | 0;
		h = c + (d << 1) | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= 20) break;
			o = b[a >> 1] | 0;
			n = b[c >> 1] | 0;
			p = o;
			m = 0;
			o = (o << 16 >> 16) - (n << 16 >> 16) | 0;
			q = 1;
			while (1) {
				if ((q | 0) > (l | 0)) break;
				t = b[a + (q << 1) >> 1] | 0;
				s = (t << 16 >> 16) - ((p << 16 >> 16) + (b[c + (q << 1) >> 1] | 0)) | 0;
				r = (s | 0) < (o | 0);
				p = t;
				m = r ? q : m;
				o = r ? s : o;
				q = q + 1 | 0
			}
			p = b[h >> 1] | 0;
			t = 32768 - ((b[g >> 1] | 0) + (p << 16 >> 16)) | 0;
			s = (t | 0) < (o | 0);
			m = s ? d : m;
			if (((s ? t : o) | 0) > -1) {
				j = 30;
				break
			}
			do
			if (!m) b[a >> 1] = n;
			else {
				if ((m | 0) == (d | 0)) {
					b[g >> 1] = 32768 - (p & 65535);
					break
				} else {
					p = 0;
					n = 0
				}
				while (1) {
					if ((n | 0) >= (m | 0)) break;
					p = p + (b[c + (n << 1) >> 1] | 0) | 0;
					n = n + 1 | 0
				}
				n = c + (m << 1) | 0;
				o = b[n >> 1] | 0;
				q = o >> 1;
				p = p + q | 0;
				r = 32768;
				s = d;
				while (1) {
					if ((s | 0) <= (m | 0)) break;
					r = r - (b[c + (s << 1) >> 1] | 0) | 0;
					s = s + -1 | 0
				}
				r = r - q | 0;
				t = b[a + (m + -1 << 1) >> 1] | 0;
				q = b[a + (m << 1) >> 1] | 0;
				q = ((t << 16 >> 16) + (q << 16 >> 16) >> 1) + ((t & 65535) + (q & 65535) & 1) | 0;
				if ((p | 0) > (r | 0)) {
					if ((q | 0) <= (p | 0)) p = (q | 0) < (r | 0) ? r : q
				} else if ((q | 0) > (r | 0)) p = r;
				else p = (q | 0) < (p | 0) ? p : q;
				t = p - (o >>> 1) | 0;
				b[a + (m + -1 << 1) >> 1] = t;
				b[a + (m << 1) >> 1] = t + (e[n >> 1] | 0)
			}
			while (0);
			k = k + 1 | 0
		}
		if ((j | 0) == 30) {
			i = f;
			return
		}
		if ((k | 0) != 20) {
			i = f;
			return
		}
		Nh(a, d);
		k = qe(b[a >> 1] | 0, b[c >> 1] | 0) | 0;
		b[a >> 1] = k;
		j = 1;
		while (1) {
			if ((j | 0) >= (d | 0)) break;
			s = a + (j << 1) | 0;
			t = qe(b[s >> 1] | 0, (k << 16 >> 16) + (b[c + (j << 1) >> 1] | 0) | 0) | 0;
			b[s >> 1] = t;
			k = t;
			j = j + 1 | 0
		}
		t = re(b[g >> 1] | 0, 32768 - (b[h >> 1] | 0) | 0) | 0;
		b[g >> 1] = t;
		g = t;
		d = d + -2 | 0;
		while (1) {
			if ((d | 0) <= -1) break;
			s = a + (d << 1) | 0;
			t = re(b[s >> 1] | 0, (g << 16 >> 16) - (b[c + (d + 1 << 1) >> 1] | 0) | 0) | 0;
			b[s >> 1] = t;
			g = t;
			d = d + -1 | 0
		}
		i = f;
		return
	}
	function qe(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function re(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function se(d, e, f, g) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		h = i;
		j = f + 2 | 0;
		k = b[j >> 1] | 0;
		l = ($(k << 16 >> 16, g) | 0) / 2 | 0;
		g = f + 16 | 0;
		f = (c[f + 20 >> 2] | 0) + l | 0;
		l = 0;
		while (1) {
			if ((l | 0) >= (k << 16 >> 16 | 0)) break;
			n = a[f >> 0] | 0;
			m = n & 255;
			b[d + (l << 1) >> 1] = (m >>> 1 & 7) * 9;
			a[e + l >> 0] = a[(c[g >> 2] | 0) + (l + ((b[j >> 1] | 0) + -1 & 0 - (m & 1))) >> 0] | 0;
			k = l | 1;
			b[d + (k << 1) >> 1] = ((n & 255) >>> 5 & 255) * 9;
			a[e + k >> 0] = a[(c[g >> 2] | 0) + (l + ((b[j >> 1] | 0) + -1 & 0 - (m >>> 4 & 1)) + 1) >> 0] | 0;
			k = b[j >> 1] | 0;
			f = f + 1 | 0;
			l = l + 2 | 0
		}
		i = h;
		return
	}
	function te(d, e, f, g, h, j, k, l, m, n, o, p, q, r, s) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		var t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0;
		t = i;
		c[e + 4368 >> 2] = a[f + 34 >> 0];
		v = e + 4356 | 0;
		R = c[v >> 2] | 0;
		u = f + 29 | 0;
		w = b[24968 + (a[u >> 0] >> 1 << 2) + (a[f + 30 >> 0] << 1) >> 1] | 0;
		C = (a[f + 31 >> 0] | 0) == 4 ? 0 : 1;
		x = d + 4616 | 0;
		f = c[x >> 2] | 0;
		y = d + 4608 | 0;
		H = f + (c[y >> 2] | 0) | 0;
		J = i;
		i = i + ((4 * H | 0) + 15 & -16) | 0;
		G = i;
		i = i + ((2 * H | 0) + 15 & -16) | 0;
		H = d + 4612 | 0;
		z = i;
		i = i + ((4 * (c[H >> 2] | 0) | 0) + 15 & -16) | 0;
		c[e + 4364 >> 2] = f;
		f = e + 4360 | 0;
		c[f >> 2] = c[x >> 2];
		A = d + 4604 | 0;
		B = C ^ 1;
		E = e + 4376 | 0;
		C = C << 1 ^ 3;
		I = d + 4664 | 0;
		F = d + 5124 | 0;
		D = d + 4660 | 0;
		K = e + (c[x >> 2] << 1) | 0;
		L = 0;
		while (1) {
			M = c[A >> 2] | 0;
			if ((L | 0) >= (M | 0)) break;
			P = j + ((L >> 1 | B) << 4 << 1) | 0;
			O = k + (L * 5 << 1) | 0;
			N = l + (L << 4 << 1) | 0;
			M = c[m + (L << 2) >> 2] | 0;
			M = M >> 2 | M >>> 1 << 16;
			c[E >> 2] = 0;
			Q = a[u >> 0] | 0;
			if (Q << 24 >> 24 == 2) {
				R = c[q + (L << 2) >> 2] | 0;
				if (!(L & C)) {
					T = c[x >> 2] | 0;
					Q = c[I >> 2] | 0;
					S = T - R - Q + -2 | 0;
					U = e + (S + ($(L, c[H >> 2] | 0) | 0) << 1) | 0;
					Sd(G + (S << 1) | 0, U, P, T - S | 0, Q, c[F >> 2] | 0);
					c[E >> 2] = 1;
					c[f >> 2] = c[x >> 2];
					Q = a[u >> 0] | 0
				} else Q = 2
			}
			ue(d, e, g, z, G, J, L, s, p, q, Q << 24 >> 24);
			ve(e, a[u >> 0] | 0, z, h, K, J, P, O, N, R, M, c[n + (L << 2) >> 2] | 0, c[o + (L << 2) >> 2] | 0, c[p + (L << 2) >> 2] | 0, r, w, c[H >> 2] | 0, c[D >> 2] | 0, c[I >> 2] | 0);
			U = c[H >> 2] | 0;
			g = g + (U << 2) | 0;
			h = h + U | 0;
			K = K + (U << 1) | 0;
			L = L + 1 | 0
		}
		c[v >> 2] = c[q + (M + -1 << 2) >> 2];
		zj(e | 0, e + (c[y >> 2] << 1) | 0, c[x >> 2] << 1 | 0) | 0;
		zj(e + 1280 | 0, e + (c[y >> 2] << 2) + 1280 | 0, c[x >> 2] << 2 | 0) | 0;
		i = t;
		return
	}
	function ue(a, d, e, f, g, h, j, k, l, m, n) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		o = i;
		m = c[m + (j << 2) >> 2] | 0;
		r = l + (j << 2) | 0;
		l = c[r >> 2] | 0;
		p = we((l | 0) > 1 ? l : 1) | 0;
		q = d + 4372 | 0;
		s = c[q >> 2] | 0;
		if ((l | 0) == (s | 0)) l = 65536;
		else l = xe(s, l) | 0;
		s = (p >> 7) + 1 | 0;
		v = a + 4612 | 0;
		t = s >>> 1 << 16 >> 16;
		s = (s >> 16) + 1 >> 1;
		u = 0;
		while (1) {
			if ((u | 0) >= (c[v >> 2] | 0)) break;
			w = c[e + (u << 2) >> 2] | 0;
			c[f + (u << 2) >> 2] = ($(w >> 16, t) | 0) + (($(w & 65535, t) | 0) >> 16) + ($(w, s) | 0);
			u = u + 1 | 0
		}
		c[q >> 2] = c[r >> 2];
		e = d + 4376 | 0;
		a: do
		if (c[e >> 2] | 0) {
			if (!j) {
				w = k << 16 >> 16;
				p = ($(p >> 16, w) | 0) + (($(p & 65535, w) | 0) >> 16) << 2
			}
			j = d + 4360 | 0;
			q = c[j >> 2] | 0;
			k = p >> 16;
			f = p & 65535;
			p = q;
			q = q - m + -2 | 0;
			while (1) {
				if ((q | 0) >= (p | 0)) break a;
				p = b[g + (q << 1) >> 1] | 0;
				c[h + (q << 2) >> 2] = ($(k, p) | 0) + (($(f, p) | 0) >> 16);
				p = c[j >> 2] | 0;
				q = q + 1 | 0
			}
		}
		while (0);
		if ((l | 0) == 65536) {
			i = o;
			return
		}
		j = d + 4364 | 0;
		w = c[j >> 2] | 0;
		g = l >> 16;
		k = l & 65535;
		f = w;
		a = w - (c[a + 4616 >> 2] | 0) | 0;
		while (1) {
			if ((a | 0) >= (f | 0)) break;
			f = d + (a << 2) + 1280 | 0;
			w = c[f >> 2] | 0;
			v = w << 16 >> 16;
			c[f >> 2] = ($(g, v) | 0) + (($(k, v) | 0) >> 16) + ($(l, (w >> 15) + 1 >> 1) | 0);
			f = c[j >> 2] | 0;
			a = a + 1 | 0
		}
		b: do
		if ((n | 0) == 2 ? (c[e >> 2] | 0) == 0 : 0) {
			n = d + 4360 | 0;
			w = c[n >> 2] | 0;
			a = w;
			m = w - m + -2 | 0;
			while (1) {
				if ((m | 0) >= (a | 0)) break b;
				a = h + (m << 2) | 0;
				w = c[a >> 2] | 0;
				v = w << 16 >> 16;
				c[a >> 2] = ($(g, v) | 0) + (($(k, v) | 0) >> 16) + ($(l, (w >> 15) + 1 >> 1) | 0);
				a = c[n >> 2] | 0;
				m = m + 1 | 0
			}
		}
		while (0);
		h = d + 4352 | 0;
		w = c[h >> 2] | 0;
		v = w << 16 >> 16;
		c[h >> 2] = ($(g, v) | 0) + (($(k, v) | 0) >> 16) + ($(l, (w >> 15) + 1 >> 1) | 0);
		h = 0;
		while (1) {
			if ((h | 0) >= 32) {
				h = 0;
				break
			}
			w = d + (h << 2) + 3840 | 0;
			v = c[w >> 2] | 0;
			u = v << 16 >> 16;
			c[w >> 2] = ($(g, u) | 0) + (($(k, u) | 0) >> 16) + ($(l, (v >> 15) + 1 >> 1) | 0);
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) >= 16) break;
			w = d + (h << 2) + 4288 | 0;
			v = c[w >> 2] | 0;
			u = v << 16 >> 16;
			c[w >> 2] = ($(g, u) | 0) + (($(k, u) | 0) >> 16) + ($(l, (v >> 15) + 1 >> 1) | 0);
			h = h + 1 | 0
		}
		i = o;
		return
	}
	function ve(d, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		var x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ta = 0,
			ua = 0;
		x = i;
		D = d + 4364 | 0;
		z = d + 4360 | 0;
		y = d + 4368 | 0;
		K = w >> 1;
		J = k + 2 | 0;
		I = k + 4 | 0;
		H = k + 6 | 0;
		G = k + 8 | 0;
		F = k + 10 | 0;
		E = k + 12 | 0;
		C = k + 14 | 0;
		B = k + 16 | 0;
		A = k + 18 | 0;
		Q = (w | 0) == 16;
		P = k + 20 | 0;
		w = k + 22 | 0;
		L = k + 24 | 0;
		M = k + 26 | 0;
		N = k + 28 | 0;
		O = k + 30 | 0;
		U = (e | 0) == 2;
		R = l + 2 | 0;
		Y = l + 4 | 0;
		S = l + 6 | 0;
		V = l + 8 | 0;
		T = d + 4288 | 0;
		e = v >> 1;
		X = v + -1 | 0;
		Z = d + (X << 2) + 4288 | 0;
		X = m + (X << 1) | 0;
		W = d + 4352 | 0;
		p = p << 16 >> 16;
		_ = q << 16 >> 16;
		q = q >> 16;
		ba = (n | 0) > 0;
		aa = o << 16 >> 16;
		o = o >> 16;
		ca = s << 16 >> 16;
		s = r >>> 6 << 16 >> 16;
		ia = (r >> 21) + 1 >> 1;
		ea = t + 944 | 0;
		r = $(t << 16 >> 16, ca) | 0;
		fa = $(ea << 16 >> 16, ca) | 0;
		ha = t + -944 | 0;
		da = $(944 - t << 16 >> 16, ca) | 0;
		ja = j + ((c[z >> 2] | 0) - n + 2 << 2) | 0;
		ga = d + 3964 | 0;
		oa = d + ((c[D >> 2] | 0) - n + 1 << 2) + 1280 | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (u | 0)) break;
			c[y >> 2] = ($(c[y >> 2] | 0, 196314165) | 0) + 907633515;
			ta = c[ga >> 2] | 0;
			sa = b[k >> 1] | 0;
			sa = K + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
			ta = c[ga + -4 >> 2] | 0;
			ka = b[J >> 1] | 0;
			ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
			ta = c[ga + -8 >> 2] | 0;
			sa = b[I >> 1] | 0;
			sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
			ta = c[ga + -12 >> 2] | 0;
			ka = b[H >> 1] | 0;
			ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
			ta = c[ga + -16 >> 2] | 0;
			sa = b[G >> 1] | 0;
			sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
			ta = c[ga + -20 >> 2] | 0;
			ka = b[F >> 1] | 0;
			ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
			ta = c[ga + -24 >> 2] | 0;
			sa = b[E >> 1] | 0;
			sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
			ta = c[ga + -28 >> 2] | 0;
			ka = b[C >> 1] | 0;
			ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
			ta = c[ga + -32 >> 2] | 0;
			sa = b[B >> 1] | 0;
			sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
			ta = c[ga + -36 >> 2] | 0;
			ka = b[A >> 1] | 0;
			ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
			if (Q) {
				ta = c[ga + -40 >> 2] | 0;
				sa = b[P >> 1] | 0;
				sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
				ta = c[ga + -44 >> 2] | 0;
				ka = b[w >> 1] | 0;
				ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
				ta = c[ga + -48 >> 2] | 0;
				sa = b[L >> 1] | 0;
				sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
				ta = c[ga + -52 >> 2] | 0;
				ka = b[M >> 1] | 0;
				ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0;
				ta = c[ga + -56 >> 2] | 0;
				sa = b[N >> 1] | 0;
				sa = ka + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
				ta = c[ga + -60 >> 2] | 0;
				ka = b[O >> 1] | 0;
				ka = sa + (($(ta >> 16, ka) | 0) + (($(ta & 65535, ka) | 0) >> 16)) | 0
			}
			if (U) {
				ta = c[ja >> 2] | 0;
				la = b[l >> 1] | 0;
				la = ($(ta >> 16, la) | 0) + (($(ta & 65535, la) | 0) >> 16) + 2 | 0;
				ta = c[ja + -4 >> 2] | 0;
				sa = b[R >> 1] | 0;
				sa = la + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
				ta = c[ja + -8 >> 2] | 0;
				la = b[Y >> 1] | 0;
				la = sa + (($(ta >> 16, la) | 0) + (($(ta & 65535, la) | 0) >> 16)) | 0;
				ta = c[ja + -12 >> 2] | 0;
				sa = b[S >> 1] | 0;
				sa = la + (($(ta >> 16, sa) | 0) + (($(ta & 65535, sa) | 0) >> 16)) | 0;
				ta = c[ja + -16 >> 2] | 0;
				la = b[V >> 1] | 0;
				la = sa + (($(ta >> 16, la) | 0) + (($(ta & 65535, la) | 0) >> 16)) | 0;
				ja = ja + 4 | 0
			} else la = 0;
			ma = c[ga >> 2] | 0;
			na = c[T >> 2] | 0;
			c[T >> 2] = ma;
			pa = b[m >> 1] | 0;
			pa = e + (($(ma >> 16, pa) | 0) + (($(ma & 65535, pa) | 0) >> 16)) | 0;
			ma = 2;
			while (1) {
				if ((ma | 0) >= (v | 0)) break;
				qa = ma + -1 | 0;
				sa = d + (qa << 2) + 4288 | 0;
				ra = c[sa >> 2] | 0;
				c[sa >> 2] = na;
				qa = b[m + (qa << 1) >> 1] | 0;
				qa = pa + (($(na >> 16, qa) | 0) + (($(na & 65535, qa) | 0) >> 16)) | 0;
				sa = d + (ma << 2) + 4288 | 0;
				ta = c[sa >> 2] | 0;
				c[sa >> 2] = ra;
				sa = b[m + (ma << 1) >> 1] | 0;
				pa = qa + (($(ra >> 16, sa) | 0) + (($(ra & 65535, sa) | 0) >> 16)) | 0;
				ma = ma + 2 | 0;
				na = ta
			}
			c[Z >> 2] = na;
			ma = b[X >> 1] | 0;
			na = pa + (($(na >> 16, ma) | 0) + (($(na & 65535, ma) | 0) >> 16)) << 1;
			ma = c[W >> 2] | 0;
			pa = ma >> 16;
			ma = ma & 65535;
			na = na + (($(pa, p) | 0) + (($(ma, p) | 0) >> 16)) | 0;
			ta = c[d + ((c[D >> 2] | 0) + -1 << 2) + 1280 >> 2] | 0;
			ma = ($(ta >> 16, _) | 0) + (($(ta & 65535, _) | 0) >> 16) + ($(pa, q) | 0) + (($(ma, q) | 0) >> 16) | 0;
			pa = (ka << 2) - na - ma | 0;
			if (ba) {
				sa = (c[oa >> 2] | 0) + (c[oa + -8 >> 2] | 0) | 0;
				sa = ($(sa >> 16, aa) | 0) + (($(sa & 65535, aa) | 0) >> 16) | 0;
				ta = c[oa + -4 >> 2] | 0;
				oa = oa + 4 | 0;
				pa = la - (sa + ($(ta >> 16, o) | 0) + (($(ta & 65535, o) | 0) >> 16) << 1) + (pa << 1) >> 2
			} else pa = pa >> 1;
			ta = (c[f + (n << 2) >> 2] | 0) - (pa + 1 >> 1) | 0;
			ra = (c[y >> 2] | 0) < 0;
			sa = 0 - ta | 0;
			pa = ra ? sa : ta;
			if (((ra ? sa : ta) | 0) > 30720) pa = 30720;
			else pa = (pa | 0) < -31744 ? -31744 : pa;
			qa = pa - t >> 10;
			if ((qa | 0) <= 0) if (qa) if ((qa | 0) == -1) {
				qa = ha;
				ra = t;
				sa = da;
				ta = r
			} else {
				ta = (qa << 10 | 80) + t | 0;
				qa = ta;
				ra = ta + 1024 | 0;
				sa = $(0 - ta << 16 >> 16, ca) | 0;
				ta = $(-1024 - ta << 16 >> 16, ca) | 0
			} else {
				qa = t;
				ra = ea;
				sa = r;
				ta = fa
			} else {
				sa = (qa << 10) + -80 + t | 0;
				ta = sa + 1024 | 0;
				qa = sa;
				ra = ta;
				sa = $(sa << 16 >> 16, ca) | 0;
				ta = $(ta << 16 >> 16, ca) | 0
			}
			ua = pa - qa << 16 >> 16;
			pa = pa - ra << 16 >> 16;
			pa = (ta + ($(pa, pa) | 0) | 0) < (sa + ($(ua, ua) | 0) | 0);
			qa = pa ? ra : qa;
			pa = g + n | 0;
			a[pa >> 0] = ((qa >>> 9) + 1 | 0) >>> 1;
			qa = qa << 4;
			la = ((c[y >> 2] | 0) < 0 ? 0 - qa | 0 : qa) + (la << 1) | 0;
			ka = la + (ka << 4) | 0;
			qa = (($(ka >> 16, s) | 0) + (($(ka & 65535, s) | 0) >> 16) + ($(ka, ia) | 0) >> 7) + 1 >> 1;
			if ((qa | 0) > 32767) qa = 32767;
			else qa = (qa | 0) < -32768 ? -32768 : qa & 65535;
			b[h + (n << 1) >> 1] = qa;
			ua = ga + 4 | 0;
			c[ua >> 2] = ka;
			ta = ka - (na << 2) | 0;
			c[W >> 2] = ta;
			c[d + (c[D >> 2] << 2) + 1280 >> 2] = ta - (ma << 2);
			c[j + (c[z >> 2] << 2) >> 2] = la << 1;
			c[D >> 2] = (c[D >> 2] | 0) + 1;
			c[z >> 2] = (c[z >> 2] | 0) + 1;
			c[y >> 2] = (c[y >> 2] | 0) + (a[pa >> 0] | 0);
			ga = ua;
			n = n + 1 | 0
		}
		h = d + 3840 | 0;
		u = d + (u << 2) + 3840 | 0;
		d = h + 128 | 0;
		do {
			c[h >> 2] = c[u >> 2];
			h = h + 4 | 0;
			u = u + 4 | 0
		} while ((h | 0) < (d | 0));
		i = x;
		return
	}
	function we(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		d = ye((a | 0) > 0 ? a : 0 - a | 0) | 0;
		c = a << d + -1;
		g = c >> 16;
		a = 536870911 / (g | 0) | 0;
		f = a << 16;
		e = f >> 16;
		c = 536870912 - (($(g, e) | 0) + (($(c & 65535, e) | 0) >> 16)) << 3;
		a = f + (($(c >> 16, e) | 0) + (($(c & 65528, e) | 0) >> 16)) + ($(c, (a >> 15) + 1 >> 1) | 0) | 0;
		d = 62 - d | 0;
		c = d + -47 | 0;
		if ((c | 0) >= 1) {
			i = b;
			return ((c | 0) < 32 ? a >> c : 0) | 0
		}
		c = 47 - d | 0;
		d = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((d | 0) > (e | 0)) {
			if ((a | 0) > (d | 0)) {
				g = d;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (e | 0) ? e : a;
			g = g << c;
			i = b;
			return g | 0
		} else {
			if ((a | 0) > (e | 0)) {
				g = e;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (d | 0) ? d : a;
			g = g << c;
			i = b;
			return g | 0
		}
		return 0
	}
	function xe(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		c = i;
		e = ye((a | 0) > 0 ? a : 0 - a | 0) | 0;
		g = a << e + -1;
		d = (ye((b | 0) > 0 ? b : 0 - b | 0) | 0) + -1 | 0;
		a = b << d;
		b = (536870911 / (a >> 16 | 0) | 0) << 16 >> 16;
		f = ($(g >> 16, b) | 0) + (($(g & 65535, b) | 0) >> 16) | 0;
		a = Gj(a | 0, ((a | 0) < 0) << 31 >> 31 | 0, f | 0, ((f | 0) < 0) << 31 >> 31 | 0) | 0;
		a = uj(a | 0, D | 0, 29) | 0;
		a = g - (a & -8) | 0;
		b = f + (($(a >> 16, b) | 0) + (($(a & 65535, b) | 0) >> 16)) | 0;
		d = e + 28 - d | 0;
		a = d + -16 | 0;
		if ((a | 0) >= 0) {
			i = c;
			return ((a | 0) < 32 ? b >> a : 0) | 0
		}
		a = 16 - d | 0;
		d = -2147483648 >> a;
		e = 2147483647 >>> a;
		if ((d | 0) > (e | 0)) {
			if ((b | 0) > (d | 0)) {
				g = d;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (e | 0) ? e : b;
			g = g << a;
			i = c;
			return g | 0
		} else {
			if ((b | 0) > (e | 0)) {
				g = e;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (d | 0) ? d : b;
			g = g << a;
			i = c;
			return g | 0
		}
		return 0
	}
	function ye(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function ze(e, f, g, h, j, k, l, m, n, o, p, q, r, s, t) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		var u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0;
		w = i;
		i = i + 144 | 0;
		C = w + 128 | 0;
		H = w;
		u = f + 4356 | 0;
		da = c[u >> 2] | 0;
		I = e + 4652 | 0;
		J = c[I >> 2] | 0;
		A = i;
		i = i + ((1168 * J | 0) + 15 & -16) | 0;
		wj(A | 0, 0, J * 1168 | 0) | 0;
		E = g + 34 | 0;
		y = f + 4352 | 0;
		v = e + 4616 | 0;
		x = f + 3840 | 0;
		z = f + 4288 | 0;
		D = 0;
		while (1) {
			if ((D | 0) >= (J | 0)) break;
			F = D + (d[E >> 0] | 0) & 3;
			c[A + (D * 1168 | 0) + 1156 >> 2] = F;
			c[A + (D * 1168 | 0) + 1160 >> 2] = F;
			c[A + (D * 1168 | 0) + 1164 >> 2] = 0;
			c[A + (D * 1168 | 0) + 1152 >> 2] = c[y >> 2];
			c[A + (D * 1168 | 0) + 960 >> 2] = c[f + ((c[v >> 2] | 0) + -1 << 2) + 1280 >> 2];
			F = A + (D * 1168 | 0) + 0 | 0;
			G = x + 0 | 0;
			B = F + 128 | 0;
			do {
				c[F >> 2] = c[G >> 2];
				F = F + 4 | 0;
				G = G + 4 | 0
			} while ((F | 0) < (B | 0));
			F = A + (D * 1168 | 0) + 1088 | 0;
			G = z + 0 | 0;
			B = F + 64 | 0;
			do {
				c[F >> 2] = c[G >> 2];
				F = F + 4 | 0;
				G = G + 4 | 0
			} while ((F | 0) < (B | 0));
			D = D + 1 | 0
		}
		L = g + 29 | 0;
		ia = a[L >> 0] | 0;
		K = b[24968 + (ia << 24 >> 24 >> 1 << 2) + (a[g + 30 >> 0] << 1) >> 1] | 0;
		c[C >> 2] = 0;
		B = e + 4612 | 0;
		D = c[B >> 2] | 0;
		F = Ae(32, D) | 0;
		a: do
		if (ia << 24 >> 24 != 2) {
			if ((da | 0) > 0) F = Ae(F, da + -3 | 0) | 0
		} else {
			G = c[e + 4604 >> 2] | 0;
			J = 0;
			while (1) {
				if ((J | 0) >= (G | 0)) break a;
				F = Ae(F, (c[r + (J << 2) >> 2] | 0) + -3 | 0) | 0;
				J = J + 1 | 0
			}
		}
		while (0);
		R = (a[g + 31 >> 0] | 0) == 4 ? 0 : 1;
		J = c[v >> 2] | 0;
		g = e + 4608 | 0;
		O = J + (c[g >> 2] | 0) | 0;
		N = i;
		i = i + ((4 * O | 0) + 15 & -16) | 0;
		M = i;
		i = i + ((2 * O | 0) + 15 & -16) | 0;
		O = i;
		i = i + ((4 * D | 0) + 15 & -16) | 0;
		G = f + 4364 | 0;
		c[G >> 2] = J;
		X = f + 4360 | 0;
		c[X >> 2] = c[v >> 2];
		D = e + 4604 | 0;
		S = R ^ 1;
		T = f + 4376 | 0;
		R = R << 1 ^ 3;
		P = A + 1164 | 0;
		Y = q + 4 | 0;
		U = e + 4664 | 0;
		W = e + 5124 | 0;
		Q = e + 4660 | 0;
		V = e + 4704 | 0;
		J = f + (J << 1) | 0;
		aa = 0;
		fa = 0;
		while (1) {
			if ((aa | 0) >= (c[D >> 2] | 0)) break;
			ca = k + ((aa >> 1 | S) << 4 << 1) | 0;
			_ = l + (aa * 5 << 1) | 0;
			Z = m + (aa << 4 << 1) | 0;
			ba = c[n + (aa << 2) >> 2] | 0;
			ba = ba >> 2 | ba >>> 1 << 16;
			c[T >> 2] = 0;
			ea = a[L >> 0] | 0;
			if (ea << 24 >> 24 == 2) {
				da = c[r + (aa << 2) >> 2] | 0;
				if (!(aa & R)) {
					b: do
					if ((aa | 0) == 2) {
						fa = c[I >> 2] | 0;
						ga = c[P >> 2] | 0;
						ea = 0;
						ha = 1;
						while (1) {
							if ((ha | 0) >= (fa | 0)) {
								ga = 0;
								break
							}
							ja = c[A + (ha * 1168 | 0) + 1164 >> 2] | 0;
							ia = (ja | 0) < (ga | 0);
							ga = ia ? ja : ga;
							ea = ia ? ha : ea;
							ha = ha + 1 | 0
						}
						while (1) {
							if ((ga | 0) >= (fa | 0)) break;
							if ((ga | 0) != (ea | 0)) {
								ja = A + (ga * 1168 | 0) + 1164 | 0;
								c[ja >> 2] = (c[ja >> 2] | 0) + 134217727
							}
							ga = ga + 1 | 0
						}
						ha = (c[C >> 2] | 0) + F | 0;
						fa = 0;
						while (1) {
							if ((fa | 0) >= (F | 0)) {
								fa = 0;
								break b
							}
							ha = ha + 31 & 31;
							ga = fa - F | 0;
							a[j + ga >> 0] = (((c[A + (ea * 1168 | 0) + (ha << 2) + 576 >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
							ja = c[A + (ea * 1168 | 0) + (ha << 2) + 704 >> 2] | 0;
							ia = c[Y >> 2] | 0;
							ka = ia << 16 >> 16;
							ia = (($(ja >> 16, ka) | 0) + (($(ja & 65535, ka) | 0) >> 16) + ($(ja, (ia >> 15) + 1 >> 1) | 0) >> 13) + 1 >> 1;
							if ((ia | 0) > 32767) ia = 32767;
							else ia = (ia | 0) < -32768 ? -32768 : ia & 65535;
							b[J + (ga << 1) >> 1] = ia;
							c[f + ((c[G >> 2] | 0) - F + fa << 2) + 1280 >> 2] = c[A + (ea * 1168 | 0) + (ha << 2) + 960 >> 2];
							fa = fa + 1 | 0
						}
					}
					while (0);
					ja = c[v >> 2] | 0;
					ea = c[U >> 2] | 0;
					ka = ja - da - ea + -2 | 0;
					ia = f + (ka + ($(aa, c[B >> 2] | 0) | 0) << 1) | 0;
					Sd(M + (ka << 1) | 0, ia, ca, ja - ka | 0, ea, c[W >> 2] | 0);
					c[X >> 2] = c[v >> 2];
					c[T >> 2] = 1;
					ea = a[L >> 0] | 0
				} else ea = 2
			}
			Be(e, f, A, h, O, M, N, aa, c[I >> 2] | 0, t, q, r, ea << 24 >> 24, F);
			Ce(f, A, a[L >> 0] | 0, O, j, J, N, H, ca, _, Z, da, ba, c[o + (aa << 2) >> 2] | 0, c[p + (aa << 2) >> 2] | 0, c[q + (aa << 2) >> 2] | 0, s, K, c[B >> 2] | 0, fa, c[Q >> 2] | 0, c[U >> 2] | 0, c[V >> 2] | 0, c[I >> 2] | 0, C, F);
			ka = c[B >> 2] | 0;
			h = h + (ka << 2) | 0;
			j = j + ka | 0;
			J = J + (ka << 1) | 0;
			aa = aa + 1 | 0;
			fa = fa + 1 | 0
		}
		n = c[I >> 2] | 0;
		t = c[P >> 2] | 0;
		s = 0;
		e = 1;
		while (1) {
			if ((e | 0) >= (n | 0)) break;
			ja = c[A + (e * 1168 | 0) + 1164 >> 2] | 0;
			ka = (ja | 0) < (t | 0);
			t = ka ? ja : t;
			s = ka ? e : s;
			e = e + 1 | 0
		}
		a[E >> 0] = c[A + (s * 1168 | 0) + 1160 >> 2];
		q = c[q + ((c[D >> 2] | 0) + -1 << 2) >> 2] | 0;
		E = q >>> 6 << 16 >> 16;
		q = (q >> 21) + 1 >> 1;
		e = (c[C >> 2] | 0) + F | 0;
		C = 0;
		while (1) {
			if ((C | 0) >= (F | 0)) break;
			e = e + 31 & 31;
			n = C - F | 0;
			a[j + n >> 0] = (((c[A + (s * 1168 | 0) + (e << 2) + 576 >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
			t = c[A + (s * 1168 | 0) + (e << 2) + 704 >> 2] | 0;
			t = (($(t >> 16, E) | 0) + (($(t & 65535, E) | 0) >> 16) + ($(t, q) | 0) >> 7) + 1 >> 1;
			if ((t | 0) > 32767) t = 32767;
			else t = (t | 0) < -32768 ? -32768 : t & 65535;
			b[J + (n << 1) >> 1] = t;
			c[f + ((c[G >> 2] | 0) - F + C << 2) + 1280 >> 2] = c[A + (s * 1168 | 0) + (e << 2) + 960 >> 2];
			C = C + 1 | 0
		}
		F = x + 0 | 0;
		G = A + (s * 1168 | 0) + (c[B >> 2] << 2) + 0 | 0;
		B = F + 128 | 0;
		do {
			c[F >> 2] = c[G >> 2];
			F = F + 4 | 0;
			G = G + 4 | 0
		} while ((F | 0) < (B | 0));
		F = z + 0 | 0;
		G = A + (s * 1168 | 0) + 1088 | 0;
		B = F + 64 | 0;
		do {
			c[F >> 2] = c[G >> 2];
			F = F + 4 | 0;
			G = G + 4 | 0
		} while ((F | 0) < (B | 0));
		c[y >> 2] = c[A + (s * 1168 | 0) + 1152 >> 2];
		c[u >> 2] = c[r + ((c[D >> 2] | 0) + -1 << 2) >> 2];
		zj(f | 0, f + (c[g >> 2] << 1) | 0, c[v >> 2] << 1 | 0) | 0;
		zj(f + 1280 | 0, f + (c[g >> 2] << 2) + 1280 | 0, c[v >> 2] << 2 | 0) | 0;
		i = w;
		return
	}
	function Ae(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function Be(a, d, e, f, g, h, j, k, l, m, n, o, p, q) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		var r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0;
		r = i;
		o = c[o + (k << 2) >> 2] | 0;
		u = n + (k << 2) | 0;
		v = c[u >> 2] | 0;
		s = De((v | 0) > 1 ? v : 1) | 0;
		t = d + 4372 | 0;
		n = c[t >> 2] | 0;
		if ((v | 0) == (n | 0)) n = 65536;
		else n = Ee(n, v) | 0;
		y = (s >> 7) + 1 | 0;
		v = a + 4612 | 0;
		x = y >>> 1 << 16 >> 16;
		y = (y >> 16) + 1 >> 1;
		w = 0;
		while (1) {
			if ((w | 0) >= (c[v >> 2] | 0)) break;
			z = c[f + (w << 2) >> 2] | 0;
			c[g + (w << 2) >> 2] = ($(z >> 16, x) | 0) + (($(z & 65535, x) | 0) >> 16) + ($(z, y) | 0);
			w = w + 1 | 0
		}
		c[t >> 2] = c[u >> 2];
		f = d + 4376 | 0;
		a: do
		if (c[f >> 2] | 0) {
			if (!k) {
				z = m << 16 >> 16;
				s = ($(s >> 16, z) | 0) + (($(s & 65535, z) | 0) >> 16) << 2
			}
			m = d + 4360 | 0;
			z = c[m >> 2] | 0;
			k = s >> 16;
			g = s & 65535;
			t = z;
			s = z - o + -2 | 0;
			while (1) {
				if ((s | 0) >= (t | 0)) break a;
				t = b[h + (s << 1) >> 1] | 0;
				c[j + (s << 2) >> 2] = ($(k, t) | 0) + (($(g, t) | 0) >> 16);
				t = c[m >> 2] | 0;
				s = s + 1 | 0
			}
		}
		while (0);
		if ((n | 0) == 65536) {
			i = r;
			return
		}
		m = d + 4364 | 0;
		z = c[m >> 2] | 0;
		k = n >> 16;
		h = n & 65535;
		g = z;
		a = z - (c[a + 4616 >> 2] | 0) | 0;
		while (1) {
			if ((a | 0) >= (g | 0)) break;
			g = d + (a << 2) + 1280 | 0;
			z = c[g >> 2] | 0;
			y = z << 16 >> 16;
			c[g >> 2] = ($(k, y) | 0) + (($(h, y) | 0) >> 16) + ($(n, (z >> 15) + 1 >> 1) | 0);
			g = c[m >> 2] | 0;
			a = a + 1 | 0
		}
		b: do
		if ((p | 0) == 2 ? (c[f >> 2] | 0) == 0 : 0) {
			p = d + 4360 | 0;
			z = c[p >> 2] | 0;
			d = z;
			o = z - o + -2 | 0;
			while (1) {
				if ((o | 0) >= (d - q | 0)) {
					q = 0;
					break b
				}
				d = j + (o << 2) | 0;
				z = c[d >> 2] | 0;
				y = z << 16 >> 16;
				c[d >> 2] = ($(k, y) | 0) + (($(h, y) | 0) >> 16) + ($(n, (z >> 15) + 1 >> 1) | 0);
				d = c[p >> 2] | 0;
				o = o + 1 | 0
			}
		} else q = 0;
		while (0);
		while (1) {
			if ((q | 0) >= (l | 0)) break;
			j = c[e + (q * 1168 | 0) + 1152 >> 2] | 0;
			z = j << 16 >> 16;
			c[e + (q * 1168 | 0) + 1152 >> 2] = ($(k, z) | 0) + (($(h, z) | 0) >> 16) + ($(n, (j >> 15) + 1 >> 1) | 0);
			j = 0;
			while (1) {
				if ((j | 0) >= 32) {
					j = 0;
					break
				}
				z = e + (q * 1168 | 0) + (j << 2) | 0;
				y = c[z >> 2] | 0;
				x = y << 16 >> 16;
				c[z >> 2] = ($(k, x) | 0) + (($(h, x) | 0) >> 16) + ($(n, (y >> 15) + 1 >> 1) | 0);
				j = j + 1 | 0
			}
			while (1) {
				if ((j | 0) >= 16) {
					j = 0;
					break
				}
				z = e + (q * 1168 | 0) + (j << 2) + 1088 | 0;
				y = c[z >> 2] | 0;
				x = y << 16 >> 16;
				c[z >> 2] = ($(k, x) | 0) + (($(h, x) | 0) >> 16) + ($(n, (y >> 15) + 1 >> 1) | 0);
				j = j + 1 | 0
			}
			while (1) {
				if ((j | 0) >= 32) break;
				z = e + (q * 1168 | 0) + (j << 2) + 832 | 0;
				y = c[z >> 2] | 0;
				x = y << 16 >> 16;
				c[z >> 2] = ($(k, x) | 0) + (($(h, x) | 0) >> 16) + ($(n, (y >> 15) + 1 >> 1) | 0);
				z = e + (q * 1168 | 0) + (j << 2) + 960 | 0;
				y = c[z >> 2] | 0;
				x = y << 16 >> 16;
				c[z >> 2] = ($(k, x) | 0) + (($(h, x) | 0) >> 16) + ($(n, (y >> 15) + 1 >> 1) | 0);
				j = j + 1 | 0
			}
			q = q + 1 | 0
		}
		i = r;
		return
	}
	function Ce(d, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B, C, D) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		x = x | 0;
		y = y | 0;
		z = z | 0;
		A = A | 0;
		B = B | 0;
		C = C | 0;
		D = D | 0;
		var E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ta = 0,
			ua = 0,
			va = 0,
			wa = 0,
			xa = 0,
			ya = 0,
			za = 0,
			Aa = 0,
			Ba = 0,
			Ca = 0,
			Da = 0,
			Ea = 0,
			Fa = 0,
			Ga = 0,
			Ha = 0;
		E = i;
		F = i;
		i = i + ((48 * B | 0) + 15 & -16) | 0;
		G = d + 4364 | 0;
		H = d + 4360 | 0;
		t = t >> 6;
		I = (f | 0) == 2;
		M = n + 2 | 0;
		L = n + 4 | 0;
		K = n + 6 | 0;
		J = n + 8 | 0;
		f = (p | 0) > 0;
		N = q << 16 >> 16;
		R = q >> 16;
		S = z >> 1;
		W = m + 2 | 0;
		V = m + 4 | 0;
		U = m + 6 | 0;
		T = m + 8 | 0;
		q = m + 10 | 0;
		Q = m + 12 | 0;
		O = m + 14 | 0;
		X = m + 16 | 0;
		P = m + 18 | 0;
		Z = (z | 0) == 16;
		aa = m + 20 | 0;
		ba = m + 22 | 0;
		_ = m + 24 | 0;
		ca = m + 26 | 0;
		Y = m + 28 | 0;
		z = m + 30 | 0;
		ea = A << 16 >> 16;
		fa = y >> 1;
		da = y + -1 | 0;
		A = o + (da << 1) | 0;
		ga = r << 16 >> 16;
		r = s << 16 >> 16;
		s = s >> 16;
		ha = u << 16 >> 16;
		u = v + 944 | 0;
		ia = $(v << 16 >> 16, ha) | 0;
		na = $(u << 16 >> 16, ha) | 0;
		ka = v + -944 | 0;
		ja = $(944 - v << 16 >> 16, ha) | 0;
		ma = F + 4 | 0;
		la = F + 28 | 0;
		x = (x | 0) <= 0;
		oa = k + ((c[H >> 2] | 0) - p + 2 << 2) | 0;
		pa = d + ((c[G >> 2] | 0) - p + 1 << 2) + 1280 | 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (w | 0)) {
				n = 0;
				break
			}
			if (I) {
				Ea = c[oa >> 2] | 0;
				qa = b[n >> 1] | 0;
				qa = ($(Ea >> 16, qa) | 0) + (($(Ea & 65535, qa) | 0) >> 16) + 2 | 0;
				Ea = c[oa + -4 >> 2] | 0;
				Da = b[M >> 1] | 0;
				Da = qa + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[oa + -8 >> 2] | 0;
				qa = b[L >> 1] | 0;
				qa = Da + (($(Ea >> 16, qa) | 0) + (($(Ea & 65535, qa) | 0) >> 16)) | 0;
				Ea = c[oa + -12 >> 2] | 0;
				Da = b[K >> 1] | 0;
				Da = qa + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[oa + -16 >> 2] | 0;
				qa = b[J >> 1] | 0;
				qa = Da + (($(Ea >> 16, qa) | 0) + (($(Ea & 65535, qa) | 0) >> 16)) << 1;
				oa = oa + 4 | 0
			} else qa = 0;
			if (f) {
				Ea = (c[pa >> 2] | 0) + (c[pa + -8 >> 2] | 0) | 0;
				Ea = ($(Ea >> 16, N) | 0) + (($(Ea & 65535, N) | 0) >> 16) | 0;
				ra = c[pa + -4 >> 2] | 0;
				ra = qa - (Ea + ($(ra >> 16, R) | 0) + (($(ra & 65535, R) | 0) >> 16) << 2) | 0;
				pa = pa + 4 | 0
			} else ra = 0;
			ta = p + 31 | 0;
			ua = g + (p << 2) | 0;
			sa = 0;
			while (1) {
				if ((sa | 0) >= (B | 0)) break;
				wa = F + (sa * 48 | 0) | 0;
				za = e + (sa * 1168 | 0) + 1156 | 0;
				c[za >> 2] = ($(c[e + (sa * 1168 | 0) + 1156 >> 2] | 0, 196314165) | 0) + 907633515;
				xa = e + (sa * 1168 | 0) + (ta << 2) | 0;
				Ea = c[xa >> 2] | 0;
				Da = b[m >> 1] | 0;
				Da = S + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 30 << 2) >> 2] | 0;
				va = b[W >> 1] | 0;
				va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 29 << 2) >> 2] | 0;
				Da = b[V >> 1] | 0;
				Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 28 << 2) >> 2] | 0;
				va = b[U >> 1] | 0;
				va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 27 << 2) >> 2] | 0;
				Da = b[T >> 1] | 0;
				Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 26 << 2) >> 2] | 0;
				va = b[q >> 1] | 0;
				va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 25 << 2) >> 2] | 0;
				Da = b[Q >> 1] | 0;
				Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 24 << 2) >> 2] | 0;
				va = b[O >> 1] | 0;
				va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 23 << 2) >> 2] | 0;
				Da = b[X >> 1] | 0;
				Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
				Ea = c[e + (sa * 1168 | 0) + (p + 22 << 2) >> 2] | 0;
				va = b[P >> 1] | 0;
				va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
				if (Z) {
					Ea = c[e + (sa * 1168 | 0) + (p + 21 << 2) >> 2] | 0;
					Da = b[aa >> 1] | 0;
					Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
					Ea = c[e + (sa * 1168 | 0) + (p + 20 << 2) >> 2] | 0;
					va = b[ba >> 1] | 0;
					va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
					Ea = c[e + (sa * 1168 | 0) + (p + 19 << 2) >> 2] | 0;
					Da = b[_ >> 1] | 0;
					Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
					Ea = c[e + (sa * 1168 | 0) + (p + 18 << 2) >> 2] | 0;
					va = b[ca >> 1] | 0;
					va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0;
					Ea = c[e + (sa * 1168 | 0) + (p + 17 << 2) >> 2] | 0;
					Da = b[Y >> 1] | 0;
					Da = va + (($(Ea >> 16, Da) | 0) + (($(Ea & 65535, Da) | 0) >> 16)) | 0;
					Ea = c[e + (sa * 1168 | 0) + (p + 16 << 2) >> 2] | 0;
					va = b[z >> 1] | 0;
					va = Da + (($(Ea >> 16, va) | 0) + (($(Ea & 65535, va) | 0) >> 16)) | 0
				}
				va = va << 4;
				ya = e + (sa * 1168 | 0) + 1088 | 0;
				Ea = c[ya >> 2] | 0;
				Aa = (c[xa >> 2] | 0) + (($(Ea >> 16, ea) | 0) + (($(Ea & 65535, ea) | 0) >> 16)) | 0;
				Ba = c[e + (sa * 1168 | 0) + 1092 >> 2] | 0;
				xa = Ba - Aa | 0;
				xa = Ea + (($(xa >> 16, ea) | 0) + (($(xa & 65535, ea) | 0) >> 16)) | 0;
				c[ya >> 2] = Aa;
				ya = b[o >> 1] | 0;
				ya = fa + (($(Aa >> 16, ya) | 0) + (($(Aa & 65535, ya) | 0) >> 16)) | 0;
				Aa = 2;
				while (1) {
					if ((Aa | 0) >= (y | 0)) break;
					Fa = Aa + -1 | 0;
					Da = e + (sa * 1168 | 0) + (Aa << 2) + 1088 | 0;
					Ha = c[Da >> 2] | 0;
					Ca = Ha - xa | 0;
					Ca = Ba + (($(Ca >> 16, ea) | 0) + (($(Ca & 65535, ea) | 0) >> 16)) | 0;
					c[e + (sa * 1168 | 0) + (Fa << 2) + 1088 >> 2] = xa;
					Fa = b[o + (Fa << 1) >> 1] | 0;
					Fa = ya + (($(xa >> 16, Fa) | 0) + (($(xa & 65535, Fa) | 0) >> 16)) | 0;
					Ga = c[e + (sa * 1168 | 0) + ((Aa | 1) << 2) + 1088 >> 2] | 0;
					Ea = Ga - Ca | 0;
					Ea = Ha + (($(Ea >> 16, ea) | 0) + (($(Ea & 65535, ea) | 0) >> 16)) | 0;
					c[Da >> 2] = Ca;
					Da = b[o + (Aa << 1) >> 1] | 0;
					Ba = Ga;
					ya = Fa + (($(Ca >> 16, Da) | 0) + (($(Ca & 65535, Da) | 0) >> 16)) | 0;
					Aa = Aa + 2 | 0;
					xa = Ea
				}
				c[e + (sa * 1168 | 0) + (da << 2) + 1088 >> 2] = xa;
				Ha = b[A >> 1] | 0;
				ya = ya + (($(xa >> 16, Ha) | 0) + (($(xa & 65535, Ha) | 0) >> 16)) << 1;
				xa = c[e + (sa * 1168 | 0) + 1152 >> 2] | 0;
				Ha = xa >> 16;
				xa = xa & 65535;
				ya = ya + (($(Ha, ga) | 0) + (($(xa, ga) | 0) >> 16)) << 2;
				Ga = c[e + (sa * 1168 | 0) + (c[C >> 2] << 2) + 960 >> 2] | 0;
				xa = ($(Ga >> 16, r) | 0) + (($(Ga & 65535, r) | 0) >> 16) + ($(Ha, s) | 0) + (($(xa, s) | 0) >> 16) << 2;
				Ha = (c[ua >> 2] | 0) - ((ra + va - (ya + xa) >> 3) + 1 >> 1) | 0;
				za = (c[za >> 2] | 0) < 0;
				Ga = 0 - Ha | 0;
				Aa = za ? Ga : Ha;
				if (((za ? Ga : Ha) | 0) > 30720) Da = 30720;
				else Da = (Aa | 0) < -31744 ? -31744 : Aa;
				Aa = Da - v >> 10;
				if ((Aa | 0) <= 0) if (Aa) if ((Aa | 0) == -1) {
					Aa = ka;
					Ba = v;
					Ca = ja;
					Ea = ia
				} else {
					Ea = (Aa << 10 | 80) + v | 0;
					Aa = Ea;
					Ba = Ea + 1024 | 0;
					Ca = $(0 - Ea << 16 >> 16, ha) | 0;
					Ea = $(-1024 - Ea << 16 >> 16, ha) | 0
				} else {
					Aa = v;
					Ba = u;
					Ca = ia;
					Ea = na
				} else {
					Ca = (Aa << 10) + -80 + v | 0;
					Ea = Ca + 1024 | 0;
					Aa = Ca;
					Ba = Ea;
					Ca = $(Ca << 16 >> 16, ha) | 0;
					Ea = $(Ea << 16 >> 16, ha) | 0
				}
				Ha = Da - Aa << 16 >> 16;
				Ca = Ca + ($(Ha, Ha) | 0) >> 10;
				Da = Da - Ba << 16 >> 16;
				Ea = Ea + ($(Da, Da) | 0) >> 10;
				Da = c[e + (sa * 1168 | 0) + 1164 >> 2] | 0;
				if ((Ca | 0) < (Ea | 0)) {
					c[F + (sa * 48 | 0) + 4 >> 2] = Da + Ca;
					c[F + (sa * 48 | 0) + 28 >> 2] = Da + Ea;
					c[wa >> 2] = Aa;
					c[F + (sa * 48 | 0) + 24 >> 2] = Ba;
					wa = Aa;
					Aa = Ba
				} else {
					c[F + (sa * 48 | 0) + 4 >> 2] = Da + Ea;
					c[F + (sa * 48 | 0) + 28 >> 2] = Da + Ca;
					c[wa >> 2] = Ba;
					c[F + (sa * 48 | 0) + 24 >> 2] = Aa;
					wa = Ba
				}
				Ha = wa << 4;
				Ha = (za ? 0 - Ha | 0 : Ha) + qa | 0;
				Ga = Ha + va | 0;
				Fa = Ga - ya | 0;
				c[F + (sa * 48 | 0) + 16 >> 2] = Fa - xa;
				c[F + (sa * 48 | 0) + 12 >> 2] = Fa;
				c[F + (sa * 48 | 0) + 20 >> 2] = Ha;
				c[F + (sa * 48 | 0) + 8 >> 2] = Ga;
				Ga = Aa << 4;
				Ga = (za ? 0 - Ga | 0 : Ga) + qa | 0;
				Ha = Ga + va | 0;
				Fa = Ha - ya | 0;
				c[F + (sa * 48 | 0) + 40 >> 2] = Fa - xa;
				c[F + (sa * 48 | 0) + 36 >> 2] = Fa;
				c[F + (sa * 48 | 0) + 44 >> 2] = Ga;
				c[F + (sa * 48 | 0) + 32 >> 2] = Ha;
				sa = sa + 1 | 0
			}
			qa = (c[C >> 2] | 0) + 31 | 0;
			c[C >> 2] = qa & 31;
			qa = qa + D & 31;
			sa = c[ma >> 2] | 0;
			ra = 0;
			ta = 1;
			while (1) {
				if ((ta | 0) >= (B | 0)) break;
				Ga = c[F + (ta * 48 | 0) + 4 >> 2] | 0;
				Ha = (Ga | 0) < (sa | 0);
				sa = Ha ? Ga : sa;
				ra = Ha ? ta : ra;
				ta = ta + 1 | 0
			}
			sa = c[e + (ra * 1168 | 0) + (qa << 2) + 448 >> 2] | 0;
			ta = 0;
			while (1) {
				if ((ta | 0) >= (B | 0)) break;
				if ((c[e + (ta * 1168 | 0) + (qa << 2) + 448 >> 2] | 0) != (sa | 0)) {
					Ha = F + (ta * 48 | 0) + 4 | 0;
					c[Ha >> 2] = (c[Ha >> 2] | 0) + 134217727;
					Ha = F + (ta * 48 | 0) + 28 | 0;
					c[Ha >> 2] = (c[Ha >> 2] | 0) + 134217727
				}
				ta = ta + 1 | 0
			}
			sa = c[ma >> 2] | 0;
			va = 0;
			ua = c[la >> 2] | 0;
			ta = 0;
			wa = 1;
			while (1) {
				if ((wa | 0) >= (B | 0)) break;
				Ea = c[F + (wa * 48 | 0) + 4 >> 2] | 0;
				Fa = (Ea | 0) > (sa | 0);
				Ga = c[F + (wa * 48 | 0) + 28 >> 2] | 0;
				Ha = (Ga | 0) < (ua | 0);
				sa = Fa ? Ea : sa;
				va = Fa ? wa : va;
				ua = Ha ? Ga : ua;
				ta = Ha ? wa : ta;
				wa = wa + 1 | 0
			}
			if ((ua | 0) < (sa | 0)) {
				yj(e + (va * 1168 | 0) + (p << 2) | 0, e + (ta * 1168 | 0) + (p << 2) | 0, 1168 - (p << 2) | 0) | 0;
				Ha = F + (va * 48 | 0) | 0;
				Ga = F + (ta * 48 | 0) + 24 | 0;
				c[Ha + 0 >> 2] = c[Ga + 0 >> 2];
				c[Ha + 4 >> 2] = c[Ga + 4 >> 2];
				c[Ha + 8 >> 2] = c[Ga + 8 >> 2];
				c[Ha + 12 >> 2] = c[Ga + 12 >> 2];
				c[Ha + 16 >> 2] = c[Ga + 16 >> 2];
				c[Ha + 20 >> 2] = c[Ga + 20 >> 2]
			}
			if (!(x & (p | 0) < (D | 0))) {
				sa = p - D | 0;
				a[h + sa >> 0] = (((c[e + (ra * 1168 | 0) + (qa << 2) + 576 >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
				Ha = c[e + (ra * 1168 | 0) + (qa << 2) + 704 >> 2] | 0;
				ta = c[l + (qa << 2) >> 2] | 0;
				Ga = ta << 16 >> 16;
				ta = (($(Ha >> 16, Ga) | 0) + (($(Ha & 65535, Ga) | 0) >> 16) + ($(Ha, (ta >> 15) + 1 >> 1) | 0) >> 7) + 1 >> 1;
				if ((ta | 0) > 32767) ta = 32767;
				else ta = (ta | 0) < -32768 ? -32768 : ta & 65535;
				b[j + (sa << 1) >> 1] = ta;
				c[d + ((c[G >> 2] | 0) - D << 2) + 1280 >> 2] = c[e + (ra * 1168 | 0) + (qa << 2) + 960 >> 2];
				c[k + ((c[H >> 2] | 0) - D << 2) >> 2] = c[e + (ra * 1168 | 0) + (qa << 2) + 832 >> 2]
			}
			c[G >> 2] = (c[G >> 2] | 0) + 1;
			c[H >> 2] = (c[H >> 2] | 0) + 1;
			qa = p + 32 | 0;
			ra = 0;
			while (1) {
				if ((ra | 0) >= (B | 0)) break;
				c[e + (ra * 1168 | 0) + 1152 >> 2] = c[F + (ra * 48 | 0) + 12 >> 2];
				Ha = c[F + (ra * 48 | 0) + 8 >> 2] | 0;
				c[e + (ra * 1168 | 0) + (qa << 2) >> 2] = Ha;
				c[e + (ra * 1168 | 0) + (c[C >> 2] << 2) + 704 >> 2] = Ha;
				Ha = c[F + (ra * 48 | 0) >> 2] | 0;
				c[e + (ra * 1168 | 0) + (c[C >> 2] << 2) + 576 >> 2] = Ha;
				c[e + (ra * 1168 | 0) + (c[C >> 2] << 2) + 832 >> 2] = c[F + (ra * 48 | 0) + 20 >> 2] << 1;
				c[e + (ra * 1168 | 0) + (c[C >> 2] << 2) + 960 >> 2] = c[F + (ra * 48 | 0) + 16 >> 2];
				Ga = e + (ra * 1168 | 0) + 1156 | 0;
				Ha = (c[Ga >> 2] | 0) + ((Ha >> 9) + 1 >> 1) | 0;
				c[Ga >> 2] = Ha;
				c[e + (ra * 1168 | 0) + (c[C >> 2] << 2) + 448 >> 2] = Ha;
				c[e + (ra * 1168 | 0) + 1164 >> 2] = c[F + (ra * 48 | 0) + 4 >> 2];
				ra = ra + 1 | 0
			}
			c[l + (c[C >> 2] << 2) >> 2] = t;
			p = p + 1 | 0
		}
		while (1) {
			if ((n | 0) >= (B | 0)) break;
			g = e + (n * 1168 | 0) + 0 | 0;
			G = e + (n * 1168 | 0) + (w << 2) + 0 | 0;
			F = g + 128 | 0;
			do {
				c[g >> 2] = c[G >> 2];
				g = g + 4 | 0;
				G = G + 4 | 0
			} while ((g | 0) < (F | 0));
			n = n + 1 | 0
		}
		i = E;
		return
	}
	function De(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		d = Fe((a | 0) > 0 ? a : 0 - a | 0) | 0;
		c = a << d + -1;
		g = c >> 16;
		a = 536870911 / (g | 0) | 0;
		f = a << 16;
		e = f >> 16;
		c = 536870912 - (($(g, e) | 0) + (($(c & 65535, e) | 0) >> 16)) << 3;
		a = f + (($(c >> 16, e) | 0) + (($(c & 65528, e) | 0) >> 16)) + ($(c, (a >> 15) + 1 >> 1) | 0) | 0;
		d = 62 - d | 0;
		c = d + -47 | 0;
		if ((c | 0) >= 1) {
			i = b;
			return ((c | 0) < 32 ? a >> c : 0) | 0
		}
		c = 47 - d | 0;
		d = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((d | 0) > (e | 0)) {
			if ((a | 0) > (d | 0)) {
				g = d;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (e | 0) ? e : a;
			g = g << c;
			i = b;
			return g | 0
		} else {
			if ((a | 0) > (e | 0)) {
				g = e;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (d | 0) ? d : a;
			g = g << c;
			i = b;
			return g | 0
		}
		return 0
	}
	function Ee(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		c = i;
		e = Fe((a | 0) > 0 ? a : 0 - a | 0) | 0;
		g = a << e + -1;
		d = (Fe((b | 0) > 0 ? b : 0 - b | 0) | 0) + -1 | 0;
		a = b << d;
		b = (536870911 / (a >> 16 | 0) | 0) << 16 >> 16;
		f = ($(g >> 16, b) | 0) + (($(g & 65535, b) | 0) >> 16) | 0;
		a = Gj(a | 0, ((a | 0) < 0) << 31 >> 31 | 0, f | 0, ((f | 0) < 0) << 31 >> 31 | 0) | 0;
		a = uj(a | 0, D | 0, 29) | 0;
		a = g - (a & -8) | 0;
		b = f + (($(a >> 16, b) | 0) + (($(a & 65535, b) | 0) >> 16)) | 0;
		d = e + 28 - d | 0;
		a = d + -16 | 0;
		if ((a | 0) >= 0) {
			i = c;
			return ((a | 0) < 32 ? b >> a : 0) | 0
		}
		a = 16 - d | 0;
		d = -2147483648 >> a;
		e = 2147483647 >>> a;
		if ((d | 0) > (e | 0)) {
			if ((b | 0) > (d | 0)) {
				g = d;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (e | 0) ? e : b;
			g = g << a;
			i = c;
			return g | 0
		} else {
			if ((b | 0) > (e | 0)) {
				g = e;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (d | 0) ? d : b;
			g = g << a;
			i = c;
			return g | 0
		}
		return 0
	}
	function Fe(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Ge(a) {
		a = a | 0;
		c[a + 4168 >> 2] = c[a + 2328 >> 2] << 7;
		c[a + 4240 >> 2] = 65536;
		c[a + 4244 >> 2] = 65536;
		c[a + 4256 >> 2] = 20;
		c[a + 4252 >> 2] = 2;
		return
	}
	function He(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0;
		g = i;
		j = a + 2316 | 0;
		h = a + 4248 | 0;
		if ((c[j >> 2] | 0) != (c[h >> 2] | 0)) {
			Ge(a);
			c[h >> 2] = c[j >> 2]
		}
		if (!e) {
			Je(a, b);
			i = g;
			return
		} else {
			Ie(a, b, d, f);
			e = a + 4160 | 0;
			c[e >> 2] = (c[e >> 2] | 0) + 1;
			i = g;
			return
		}
	}
	function Ie(a, d, f, g) {
		a = a | 0;
		d = d | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0;
		h = i;
		i = i + 64 | 0;
		n = h + 20 | 0;
		p = h + 16 | 0;
		m = h + 12 | 0;
		t = h + 8 | 0;
		j = h + 24 | 0;
		u = h;
		q = a + 2336 | 0;
		A = c[q >> 2] | 0;
		l = a + 2328 | 0;
		k = i;
		i = i + ((4 * (A + (c[l >> 2] | 0) | 0) | 0) + 15 & -16) | 0;
		y = i;
		i = i + ((2 * A | 0) + 15 & -16) | 0;
		c[u >> 2] = c[a + 4240 >> 2] >> 6;
		A = a + 4244 | 0;
		o = u + 4 | 0;
		c[o >> 2] = c[A >> 2] >> 6;
		if (c[a + 2376 >> 2] | 0) {
			s = a + 4182 | 0;
			v = s + 32 | 0;
			do {
				b[s >> 1] = 0;
				s = s + 2 | 0
			} while ((s | 0) < (v | 0))
		}
		r = a + 2332 | 0;
		s = a + 2324 | 0;
		Qe(m, n, t, p, a + 4 | 0, u, c[r >> 2] | 0, c[s >> 2] | 0);
		u = c[a + 4252 >> 2] | 0;
		if ((c[m >> 2] >> c[p >> 2] | 0) < (c[t >> 2] >> c[n >> 2] | 0)) m = $(u + -1 | 0, c[a + 4256 >> 2] | 0) | 0;
		else m = $(u, c[a + 4256 >> 2] | 0) | 0;
		w = Re(m + -128 | 0) | 0;
		v = a + 4172 | 0;
		m = a + 4224 | 0;
		x = b[m >> 1] | 0;
		t = a + 4160 | 0;
		n = Se(c[t >> 2] | 0) | 0;
		B = b[21208 + (n << 1) >> 1] | 0;
		p = a + 4164 | 0;
		if ((c[p >> 2] | 0) == 2) n = b[21216 + (n << 1) >> 1] | 0;
		else n = b[21224 + (n << 1) >> 1] | 0;
		E = n << 16 >> 16;
		u = a + 4182 | 0;
		n = a + 2340 | 0;
		hf(u, c[n >> 2] | 0, 64881);
		C = c[n >> 2] | 0;
		yj(j | 0, a + 4182 | 0, C << 1 | 0) | 0;
		do
		if (!(c[t >> 2] | 0)) {
			if ((c[p >> 2] | 0) == 2) {
				t = 16384;
				p = 0
			} else {
				C = (Me(4194304, Ue(134217728, Td(u, C) | 0) | 0) | 0) << 3;
				E = ($(C >> 16, E) | 0) + (($(C & 65528, E) | 0) >> 16) >> 14;
				C = c[n >> 2] | 0;
				x = 16384;
				break
			}
			while (1) {
				if ((p | 0) >= 5) break;
				t = (t & 65535) - (e[a + (p << 1) + 4172 >> 1] | 0) & 65535;
				p = p + 1 | 0
			}
			x = (Te(t) | 0) << 16 >> 16;
			x = ($(x, b[a + 4236 >> 1] | 0) | 0) >>> 14 & 65535
		}
		while (0);
		p = a + 4220 | 0;
		u = c[p >> 2] | 0;
		z = a + 4168 | 0;
		t = (c[z >> 2] >> 7) + 1 >> 1;
		D = c[q >> 2] | 0;
		F = D - t - C + -2 | 0;
		Sd(y + (F << 1) | 0, a + (F << 1) + 1348 | 0, j, D - F | 0, C, g);
		A = Ve(c[A >> 2] | 0) | 0;
		A = (A | 0) < 1073741823 ? A : 1073741823;
		C = c[q >> 2] | 0;
		g = A >> 16;
		A = A & 65535;
		F = F + (c[n >> 2] | 0) | 0;
		while (1) {
			if ((F | 0) >= (C | 0)) break;
			J = b[y + (F << 1) >> 1] | 0;
			c[k + (F << 2) >> 2] = ($(g, J) | 0) + (($(A, J) | 0) >> 16);
			F = F + 1 | 0
		}
		g = a + 4174 | 0;
		C = a + 4176 | 0;
		A = a + 4178 | 0;
		y = a + 4180 | 0;
		B = B << 16 >> 16;
		E = E << 16 >> 16;
		F = a + 2316 | 0;
		G = 0;
		while (1) {
			if ((G | 0) >= (c[s >> 2] | 0)) break;
			x = x << 16 >> 16;
			H = c[r >> 2] | 0;
			t = k + (D - t + 2 << 2) | 0;
			I = 0;
			while (1) {
				if ((I | 0) >= (H | 0)) {
					t = 0;
					break
				}
				J = c[t >> 2] | 0;
				L = b[v >> 1] | 0;
				L = ($(J >> 16, L) | 0) + (($(J & 65535, L) | 0) >> 16) + 2 | 0;
				J = c[t + -4 >> 2] | 0;
				K = b[g >> 1] | 0;
				K = L + (($(J >> 16, K) | 0) + (($(J & 65535, K) | 0) >> 16)) | 0;
				J = c[t + -8 >> 2] | 0;
				L = b[C >> 1] | 0;
				L = K + (($(J >> 16, L) | 0) + (($(J & 65535, L) | 0) >> 16)) | 0;
				J = c[t + -12 >> 2] | 0;
				K = b[A >> 1] | 0;
				K = L + (($(J >> 16, K) | 0) + (($(J & 65535, K) | 0) >> 16)) | 0;
				J = c[t + -16 >> 2] | 0;
				L = b[y >> 1] | 0;
				L = K + (($(J >> 16, L) | 0) + (($(J & 65535, L) | 0) >> 16)) | 0;
				J = ($(u, 196314165) | 0) + 907633515 | 0;
				K = c[a + (w + (J >>> 25) << 2) + 4 >> 2] | 0;
				c[k + (D << 2) >> 2] = L + (($(K >> 16, x) | 0) + (($(K & 65535, x) | 0) >> 16)) << 2;
				t = t + 4 | 0;
				u = J;
				D = D + 1 | 0;
				I = I + 1 | 0
			}
			while (1) {
				if ((t | 0) >= 5) break;
				L = a + (t << 1) + 4172 | 0;
				b[L >> 1] = ($(B, b[L >> 1] | 0) | 0) >>> 15;
				t = t + 1 | 0
			}
			x = ($(x, E) | 0) >>> 15 & 65535;
			t = c[z >> 2] | 0;
			t = Ue(t + (((t >> 16) * 655 | 0) + (((t & 65535) * 655 | 0) >>> 16)) | 0, (c[F >> 2] << 16 >> 16) * 4608 | 0) | 0;
			c[z >> 2] = t;
			t = (t >> 7) + 1 >> 1;
			G = G + 1 | 0
		}
		q = c[q >> 2] | 0;
		r = q + -16 | 0;
		a = a + 1284 | 0;
		s = k + (r << 2) + 0 | 0;
		w = a + 0 | 0;
		v = s + 64 | 0;
		do {
			c[s >> 2] = c[w >> 2];
			s = s + 4 | 0;
			w = w + 4 | 0
		} while ((s | 0) < (v | 0));
		w = b[j >> 1] | 0;
		D = b[j + 2 >> 1] | 0;
		A = b[j + 4 >> 1] | 0;
		v = b[j + 6 >> 1] | 0;
		y = b[j + 8 >> 1] | 0;
		z = b[j + 10 >> 1] | 0;
		s = b[j + 12 >> 1] | 0;
		g = b[j + 14 >> 1] | 0;
		B = b[j + 16 >> 1] | 0;
		C = b[j + 18 >> 1] | 0;
		o = c[o >> 2] | 0;
		E = o << 16 >> 16;
		o = (o >> 15) + 1 >> 1;
		F = 0;
		while (1) {
			G = c[l >> 2] | 0;
			if ((F | 0) >= (G | 0)) break;
			G = c[k + (r + (F + 15) << 2) >> 2] | 0;
			G = (c[n >> 2] >> 1) + (($(G >> 16, w) | 0) + (($(G & 65535, w) | 0) >> 16)) | 0;
			I = c[k + (r + (F + 14) << 2) >> 2] | 0;
			I = G + (($(I >> 16, D) | 0) + (($(I & 65535, D) | 0) >> 16)) | 0;
			G = c[k + (r + (F + 13) << 2) >> 2] | 0;
			G = I + (($(G >> 16, A) | 0) + (($(G & 65535, A) | 0) >> 16)) | 0;
			I = c[k + (r + (F + 12) << 2) >> 2] | 0;
			I = G + (($(I >> 16, v) | 0) + (($(I & 65535, v) | 0) >> 16)) | 0;
			G = c[k + (r + (F + 11) << 2) >> 2] | 0;
			G = I + (($(G >> 16, y) | 0) + (($(G & 65535, y) | 0) >> 16)) | 0;
			I = c[k + (r + (F + 10) << 2) >> 2] | 0;
			I = G + (($(I >> 16, z) | 0) + (($(I & 65535, z) | 0) >> 16)) | 0;
			G = c[k + (r + (F + 9) << 2) >> 2] | 0;
			G = I + (($(G >> 16, s) | 0) + (($(G & 65535, s) | 0) >> 16)) | 0;
			I = c[k + (r + (F + 8) << 2) >> 2] | 0;
			I = G + (($(I >> 16, g) | 0) + (($(I & 65535, g) | 0) >> 16)) | 0;
			G = c[k + (r + (F + 7) << 2) >> 2] | 0;
			G = I + (($(G >> 16, B) | 0) + (($(G & 65535, B) | 0) >> 16)) | 0;
			I = c[k + (r + (F + 6) << 2) >> 2] | 0;
			I = G + (($(I >> 16, C) | 0) + (($(I & 65535, C) | 0) >> 16)) | 0;
			G = c[n >> 2] | 0;
			H = F + 16 | 0;
			J = 10;
			while (1) {
				if ((J | 0) >= (G | 0)) break;
				K = c[k + (r + (H - J + -1) << 2) >> 2] | 0;
				L = b[j + (J << 1) >> 1] | 0;
				I = I + (($(K >> 16, L) | 0) + (($(K & 65535, L) | 0) >> 16)) | 0;
				J = J + 1 | 0
			}
			L = k + (q + F << 2) | 0;
			G = (c[L >> 2] | 0) + (I << 4) | 0;
			c[L >> 2] = G;
			G = (($(G >> 16, E) | 0) + (($(G & 65535, E) | 0) >> 16) + ($(G, o) | 0) >> 7) + 1 >> 1;
			if ((G | 0) > 32767) G = 32767;
			else G = (G | 0) < -32768 ? -32768 : G & 65535;
			b[f + (F << 1) >> 1] = G;
			F = F + 1 | 0
		}
		s = a + 0 | 0;
		w = k + (r + G << 2) + 0 | 0;
		v = s + 64 | 0;
		do {
			c[s >> 2] = c[w >> 2];
			s = s + 4 | 0;
			w = w + 4 | 0
		} while ((s | 0) < (v | 0));
		c[p >> 2] = u;
		b[m >> 1] = x;
		j = 0;
		while (1) {
			if ((j | 0) >= 4) break;
			c[d + (j << 2) >> 2] = t;
			j = j + 1 | 0
		}
		i = h;
		return
	}
	function Je(d, e) {
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		f = i;
		k = d + 4168 | 0;
		r = a[d + 2765 >> 0] | 0;
		c[d + 4164 >> 2] = r << 24 >> 24;
		a: do
		if (r << 24 >> 24 == 2) {
			g = d + 2324 | 0;
			h = d + 2332 | 0;
			n = d + 4172 | 0;
			j = c[h >> 2] | 0;
			l = c[g >> 2] | 0;
			p = 0;
			m = 0;
			while (1) {
				q = $(m, j) | 0;
				r = l + -1 | 0;
				if ((m | 0) == (l | 0) ? 1 : (q | 0) >= (c[e + (r << 2) >> 2] | 0)) break;
				else {
					o = 0;
					q = 0
				}
				while (1) {
					if ((o | 0) >= 5) break;
					s = q + (b[e + (((r - m | 0) * 5 | 0) + o << 1) + 96 >> 1] | 0) | 0;
					o = o + 1 | 0;
					q = s
				}
				if ((q | 0) > (p | 0)) {
					p = e + ((l + 65535 - m << 16 >> 16) * 5 << 1) + 96 | 0;
					b[n + 0 >> 1] = b[p + 0 >> 1] | 0;
					b[n + 2 >> 1] = b[p + 2 >> 1] | 0;
					b[n + 4 >> 1] = b[p + 4 >> 1] | 0;
					b[n + 6 >> 1] = b[p + 6 >> 1] | 0;
					b[n + 8 >> 1] = b[p + 8 >> 1] | 0;
					c[k >> 2] = c[e + (l + -1 - m << 2) >> 2] << 8;
					p = q
				}
				m = m + 1 | 0
			}
			b[n + 0 >> 1] = 0;
			b[n + 2 >> 1] = 0;
			b[n + 4 >> 1] = 0;
			b[n + 6 >> 1] = 0;
			b[n + 8 >> 1] = 0;
			b[d + 4176 >> 1] = p;
			if ((p | 0) < 11469) {
				j = (11744256 / (((p | 0) > 1 ? p : 1) | 0) | 0) << 16 >> 16;
				k = 0;
				while (1) {
					if ((k | 0) >= 5) break a;
					s = d + (k << 1) + 4172 | 0;
					b[s >> 1] = ($(b[s >> 1] | 0, j) | 0) >>> 10;
					k = k + 1 | 0
				}
			}
			if ((p | 0) > 15565) {
				j = (255016960 / (p | 0) | 0) << 16 >> 16;
				k = 0;
				while (1) {
					if ((k | 0) >= 5) break a;
					s = d + (k << 1) + 4172 | 0;
					b[s >> 1] = ($(b[s >> 1] | 0, j) | 0) >>> 14;
					k = k + 1 | 0
				}
			}
		} else {
			c[k >> 2] = (c[d + 2316 >> 2] << 16 >> 16) * 4608;
			h = d + 4172 | 0;
			b[h + 0 >> 1] = 0;
			b[h + 2 >> 1] = 0;
			b[h + 4 >> 1] = 0;
			b[h + 6 >> 1] = 0;
			b[h + 8 >> 1] = 0;
			h = d + 2332 | 0;
			g = d + 2324 | 0
		}
		while (0);
		yj(d + 4182 | 0, e + 64 | 0, c[d + 2340 >> 2] << 1 | 0) | 0;
		b[d + 4236 >> 1] = c[e + 136 >> 2];
		s = c[g >> 2] | 0;
		p = e + (s + -2 << 2) + 16 | 0;
		q = c[p + 4 >> 2] | 0;
		r = d + 4240 | 0;
		c[r >> 2] = c[p >> 2];
		c[r + 4 >> 2] = q;
		c[d + 4256 >> 2] = c[h >> 2];
		c[d + 4252 >> 2] = s;
		i = f;
		return
	}
	function Ke(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		f = i;
		i = i + 16 | 0;
		h = f + 4 | 0;
		g = f;
		if (c[a + 4160 >> 2] | 0) {
			di(a + 4228 | 0, a + 4232 | 0, d, e);
			c[a + 4216 >> 2] = 1;
			i = f;
			return
		}
		a: do
		if (c[a + 4216 >> 2] | 0) {
			di(g, h, d, e);
			j = c[h >> 2] | 0;
			h = c[a + 4232 >> 2] | 0;
			if ((j | 0) <= (h | 0)) {
				if ((j | 0) < (h | 0)) c[g >> 2] = c[g >> 2] >> h - j
			} else {
				k = a + 4228 | 0;
				c[k >> 2] = c[k >> 2] >> j - h
			}
			h = c[g >> 2] | 0;
			j = a + 4228 | 0;
			k = c[j >> 2] | 0;
			if ((h | 0) > (k | 0)) {
				l = Le(k) | 0;
				k = k << l + -1;
				c[j >> 2] = k;
				j = h >> (Me(25 - l | 0, 0) | 0);
				c[g >> 2] = j;
				j = (Ne((k | 0) / (((j | 0) > 1 ? j : 1) | 0) | 0) | 0) << 4;
				g = ((65536 - j | 0) / (e | 0) | 0) << 2;
				h = 0;
				while (1) {
					if ((h | 0) >= (e | 0)) break a;
					l = d + (h << 1) | 0;
					k = b[l >> 1] | 0;
					b[l >> 1] = ($(j >> 16, k) | 0) + (($(j & 65532, k) | 0) >>> 16);
					j = j + g | 0;
					if ((j | 0) > 65536) break a;
					h = h + 1 | 0
				}
			}
		}
		while (0);
		c[a + 4216 >> 2] = 0;
		i = f;
		return
	}
	function Le(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Me(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function Ne(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		Oe(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function Oe(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = Le(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (Pe(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function Pe(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function Qe(a, d, e, f, g, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		l = i;
		o = i;
		i = i + ((2 * (j << 1) | 0) + 15 & -16) | 0;
		m = o;
		n = 0;
		while (1) {
			if ((n | 0) >= 2) break;
			p = $(n + k + -2 | 0, j) | 0;
			q = h + (n << 2) | 0;
			r = 0;
			while (1) {
				if ((r | 0) >= (j | 0)) break;
				t = c[g + (r + p << 2) >> 2] | 0;
				s = c[q >> 2] | 0;
				u = s << 16 >> 16;
				s = ($(t >> 16, u) | 0) + (($(t & 65535, u) | 0) >> 16) + ($(t, (s >> 15) + 1 >> 1) | 0) >> 8;
				if ((s | 0) > 32767) s = 32767;
				else s = (s | 0) < -32768 ? -32768 : s & 65535;
				b[m + (r << 1) >> 1] = s;
				r = r + 1 | 0
			}
			m = m + (j << 1) | 0;
			n = n + 1 | 0
		}
		di(a, d, o, j);
		di(e, f, o + (j << 1) | 0, j);
		i = l;
		return
	}
	function Re(a) {
		a = a | 0;
		return ((a | 0) < 0 ? 0 : a) | 0
	}
	function Se(a) {
		a = a | 0;
		return ((a | 0) > 1 ? 1 : a) | 0
	}
	function Te(a) {
		a = a | 0;
		return (a << 16 >> 16 < 3277 ? 3277 : a) | 0
	}
	function Ue(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function Ve(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		d = Le((a | 0) > 0 ? a : 0 - a | 0) | 0;
		c = a << d + -1;
		g = c >> 16;
		a = 536870911 / (g | 0) | 0;
		f = a << 16;
		e = f >> 16;
		c = 536870912 - (($(g, e) | 0) + (($(c & 65535, e) | 0) >> 16)) << 3;
		a = f + (($(c >> 16, e) | 0) + (($(c & 65528, e) | 0) >> 16)) + ($(c, (a >> 15) + 1 >> 1) | 0) | 0;
		d = 62 - d | 0;
		c = d + -46 | 0;
		if ((c | 0) >= 1) {
			i = b;
			return ((c | 0) < 32 ? a >> c : 0) | 0
		}
		c = 46 - d | 0;
		d = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((d | 0) > (e | 0)) {
			if ((a | 0) > (d | 0)) {
				g = d;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (e | 0) ? e : a;
			g = g << c;
			i = b;
			return g | 0
		} else {
			if ((a | 0) > (e | 0)) {
				g = e;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (d | 0) ? d : a;
			g = g << c;
			i = b;
			return g | 0
		}
		return 0
	}
	function We(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		e = a + 0 | 0;
		d = e + 112 | 0;
		do {
			c[e >> 2] = 0;
			e = e + 4 | 0
		} while ((e | 0) < (d | 0));
		d = 0;
		while (1) {
			if ((d | 0) >= 4) {
				d = 0;
				break
			}
			e = d + 1 | 0;
			c[a + (d << 2) + 92 >> 2] = Xe(50 / (e | 0) | 0) | 0;
			d = e
		}
		while (1) {
			if ((d | 0) >= 4) break;
			e = (c[a + (d << 2) + 92 >> 2] | 0) * 100 | 0;
			c[a + (d << 2) + 60 >> 2] = e;
			c[a + (d << 2) + 76 >> 2] = 2147483647 / (e | 0) | 0;
			d = d + 1 | 0
		}
		c[a + 108 >> 2] = 15;
		d = 0;
		while (1) {
			if ((d | 0) >= 4) break;
			c[a + (d << 2) + 40 >> 2] = 25600;
			d = d + 1 | 0
		}
		i = b;
		return 0
	}
	function Xe(a) {
		a = a | 0;
		return ((a | 0) > 1 ? a : 1) | 0
	}
	function Ye(a, d) {
		a = a | 0;
		d = d | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		g = i;
		i = i + 48 | 0;
		j = g + 32 | 0;
		f = g + 16 | 0;
		m = g;
		k = a + 32 | 0;
		h = a + 4608 | 0;
		r = c[h >> 2] | 0;
		t = r >> 1;
		v = r >> 2;
		n = r >> 3;
		c[m >> 2] = 0;
		u = n + v | 0;
		c[m + 4 >> 2] = u;
		s = u + n | 0;
		c[m + 8 >> 2] = s;
		q = s + v | 0;
		c[m + 12 >> 2] = q;
		l = i;
		i = i + ((2 * (q + t | 0) | 0) + 15 & -16) | 0;
		ff(d, k, l, l + (q << 1) | 0, r);
		ff(l, a + 40 | 0, l, l + (s << 1) | 0, t);
		ff(l, a + 48 | 0, l, l + (u << 1) | 0, v);
		v = l + (n + -1 << 1) | 0;
		d = (b[v >> 1] | 0) >>> 1 & 65535;
		b[v >> 1] = d;
		while (1) {
			o = n + -1 | 0;
			if ((o | 0) <= 0) break;
			v = l + (n + -2 << 1) | 0;
			u = (b[v >> 1] | 0) >>> 1;
			b[v >> 1] = u;
			v = l + (o << 1) | 0;
			b[v >> 1] = (e[v >> 1] | 0) - u;
			n = o
		}
		p = a + 88 | 0;
		b[l >> 1] = (e[l >> 1] | 0) - (e[p >> 1] | 0);
		b[p >> 1] = d;
		p = 0;
		t = 0;
		while (1) {
			if ((p | 0) >= 4) break;
			s = c[h >> 2] | 0;
			s = s >> (Ze(4 - p | 0, 3) | 0) >> 2;
			o = a + (p << 2) + 56 | 0;
			u = c[o >> 2] | 0;
			n = j + (p << 2) | 0;
			c[n >> 2] = u;
			r = m + (p << 2) | 0;
			d = 0;
			q = 0;
			while (1) {
				if ((q | 0) < 4) {
					v = 0;
					t = 0
				} else break;
				while (1) {
					if ((v | 0) >= (s | 0)) break;
					w = b[l + ((c[r >> 2] | 0) + v + d << 1) >> 1] >> 3;
					v = v + 1 | 0;
					t = t + ($(w, w) | 0) | 0
				}
				if ((q | 0) < 3) {
					v = u + t | 0;
					w = (v | 0) < 0;
					u = w ? 2147483647 : v;
					v = w ? 2147483647 : v
				} else {
					v = u + (t >> 1) | 0;
					w = (v | 0) < 0;
					u = w ? 2147483647 : v;
					v = w ? 2147483647 : v
				}
				c[n >> 2] = v;
				d = d + s | 0;
				q = q + 1 | 0
			}
			c[o >> 2] = t;
			p = p + 1 | 0
		}
		_e(j, k);
		l = 0;
		k = 0;
		m = 0;
		while (1) {
			if ((k | 0) >= 4) break;
			n = c[j + (k << 2) >> 2] | 0;
			o = c[a + (k << 2) + 92 >> 2] | 0;
			d = n - o | 0;
			if ((d | 0) > 0) {
				if (n >>> 0 < 8388608) {
					n = (n << 8 | 0) / (o + 1 | 0) | 0;
					c[f + (k << 2) >> 2] = n
				} else {
					n = (n | 0) / ((o >> 8) + 1 | 0) | 0;
					c[f + (k << 2) >> 2] = n
				}
				o = (oh(n) | 0) + -1024 | 0;
				n = o << 16 >> 16;
				m = m + ($(n, n) | 0) | 0;
				if ((d | 0) < 1048576) {
					o = $(($e(d) | 0) << 6 >> 16, n) | 0;
					o = o + (($(($e(d) | 0) << 6 & 65472, n) | 0) >> 16) | 0
				}
				v = c[21232 + (k << 2) >> 2] | 0;
				w = o << 16 >> 16;
				l = l + (($(v >> 16, w) | 0) + (($(v & 65535, w) | 0) >> 16)) | 0
			} else c[f + (k << 2) >> 2] = 256;
			k = k + 1 | 0
		}
		k = Lh(((($e((m | 0) / 4 | 0) | 0) * 196608 >> 16) * 45e3 >> 16) + -128 | 0) | 0;
		c[a + 4744 >> 2] = ((Lh(l) | 0) << 1) + -32768;
		l = 0;
		m = 0;
		while (1) {
			if ((m | 0) >= 4) break;
			w = m + 1 | 0;
			l = l + ($(w, (c[j + (m << 2) >> 2] | 0) - (c[a + (m << 2) + 92 >> 2] | 0) >> 4) | 0) | 0;
			m = w
		}
		if ((l | 0) >= 1) {
			if ((l | 0) < 32768) {
				if ((c[h >> 2] | 0) == ((c[a + 4600 >> 2] | 0) * 10 | 0)) {
					if ((l | 0) > 32767) j = 32767;
					else j = (l | 0) < -32768 ? -32768 : l;
					j = j << 16
				} else {
					if ((l | 0) > 65535) j = 65535;
					else j = (l | 0) < -65536 ? -65536 : l;
					j = j << 15
				}
				w = ($e(j) | 0) + 32768 | 0;
				k = k << 16 >> 16;
				k = ($(w >> 16, k) | 0) + (($(w & 65535, k) | 0) >> 16) | 0
			}
		} else k = k >> 1;
		c[a + 4556 >> 2] = Ze(k >> 7, 255) | 0;
		j = k << 16 >> 16;
		j = (($(k >> 16, j) | 0) << 16) + ($(k & 65535, j) | 0) | 0;
		h = (c[h >> 2] | 0) == ((c[a + 4600 >> 2] | 0) * 10 | 0) ? j >> 21 : j >> 20;
		j = 0;
		while (1) {
			if ((j | 0) >= 4) break;
			v = a + (j << 2) + 72 | 0;
			u = c[v >> 2] | 0;
			w = (c[f + (j << 2) >> 2] | 0) - u | 0;
			w = u + (($(w >> 16, h) | 0) + (($(w & 65535, h) | 0) >> 16)) | 0;
			c[v >> 2] = w;
			c[a + (j << 2) + 4728 >> 2] = Lh(((oh(w) | 0) * 3 | 0) + -5120 >> 4) | 0;
			j = j + 1 | 0
		}
		i = g;
		return
	}
	function Ze(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function _e(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		d = i;
		e = b + 108 | 0;
		f = c[e >> 2] | 0;
		if ((f | 0) < 1e3) g = 32767 / ((f >> 4) + 1 | 0) | 0;
		else g = 0;
		f = 0;
		while (1) {
			if ((f | 0) >= 4) break;
			h = b + (f << 2) + 60 | 0;
			k = c[h >> 2] | 0;
			l = (c[a + (f << 2) >> 2] | 0) + (c[b + (f << 2) + 92 >> 2] | 0) | 0;
			l = (l | 0) < 0 ? 2147483647 : l;
			j = 2147483647 / (l | 0) | 0;
			if ((l | 0) <= (k << 3 | 0)) if ((l | 0) < (k | 0)) k = 1024;
			else {
				l = k << 16 >> 16;
				m = $(j >> 16, l) | 0;
				l = $(j & 65535, l) | 0;
				k = $(j, (k >> 15) + 1 >> 1) | 0;
				k = m + (l >> 16) + k >> 16 << 11 | (m + (l >>> 16) + k | 0) >>> 5 & 2047
			} else k = 128;
			m = af(k, g) | 0;
			l = b + (f << 2) + 76 | 0;
			n = c[l >> 2] | 0;
			k = j - n | 0;
			m = m << 16 >> 16;
			m = n + (($(k >> 16, m) | 0) + (($(k & 65535, m) | 0) >> 16)) | 0;
			c[l >> 2] = m;
			m = 2147483647 / (m | 0) | 0;
			c[h >> 2] = (m | 0) < 16777215 ? m : 16777215;
			f = f + 1 | 0
		}
		c[e >> 2] = (c[e >> 2] | 0) + 1;
		i = d;
		return
	}
	function $e(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		bf(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function af(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function bf(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = cf(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (df(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function cf(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function df(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function ef(b, f, g, h, j, k, l, m, n, o, p) {
		b = b | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		var q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0;
		t = i;
		c[f >> 2] = 2147483647;
		u = h + 2 | 0;
		q = h + 4 | 0;
		r = h + 6 | 0;
		s = h + 8 | 0;
		B = n << 16 >> 16;
		D = j + 4 | 0;
		x = j + 8 | 0;
		C = j + 12 | 0;
		E = j + 16 | 0;
		G = j + 28 | 0;
		H = j + 32 | 0;
		I = j + 36 | 0;
		n = j + 24 | 0;
		v = j + 52 | 0;
		w = j + 56 | 0;
		F = j + 48 | 0;
		y = j + 76 | 0;
		z = j + 72 | 0;
		A = j + 96 | 0;
		J = 0;
		while (1) {
			if ((J | 0) >= (p | 0)) break;
			K = d[l + J >> 0] | 0;
			S = $(B, d[m + J >> 0] | 0) | 0;
			P = K - o | 0;
			R = c[D >> 2] | 0;
			M = (e[u >> 1] | 0) - (a[k + 1 >> 0] << 7) << 16 >> 16;
			R = ($(R >> 16, M) | 0) + (($(R & 65535, M) | 0) >> 16) | 0;
			T = c[x >> 2] | 0;
			O = (e[q >> 1] | 0) - (a[k + 2 >> 0] << 7) << 16 >> 16;
			T = R + (($(T >> 16, O) | 0) + (($(T & 65535, O) | 0) >> 16)) | 0;
			R = c[C >> 2] | 0;
			N = (e[r >> 1] | 0) - (a[k + 3 >> 0] << 7) << 16 >> 16;
			R = T + (($(R >> 16, N) | 0) + (($(R & 65535, N) | 0) >> 16)) | 0;
			T = c[E >> 2] | 0;
			L = (e[s >> 1] | 0) - (a[k + 4 >> 0] << 7) << 16 >> 16;
			T = R + (($(T >> 16, L) | 0) + (($(T & 65535, L) | 0) >> 16)) << 1;
			R = c[j >> 2] | 0;
			Q = (e[h >> 1] | 0) - (a[k >> 0] << 7) << 16 >> 16;
			R = T + (($(R >> 16, Q) | 0) + (($(R & 65535, Q) | 0) >> 16)) | 0;
			Q = S + ((P | 0) > 0 ? P << 10 : 0) + (($(R >> 16, Q) | 0) + (($(R & 65535, Q) | 0) >> 16)) | 0;
			R = c[G >> 2] | 0;
			R = ($(R >> 16, O) | 0) + (($(R & 65535, O) | 0) >> 16) | 0;
			P = c[H >> 2] | 0;
			P = R + (($(P >> 16, N) | 0) + (($(P & 65535, N) | 0) >> 16)) | 0;
			R = c[I >> 2] | 0;
			R = P + (($(R >> 16, L) | 0) + (($(R & 65535, L) | 0) >> 16)) << 1;
			P = c[n >> 2] | 0;
			P = R + (($(P >> 16, M) | 0) + (($(P & 65535, M) | 0) >> 16)) | 0;
			M = Q + (($(P >> 16, M) | 0) + (($(P & 65535, M) | 0) >> 16)) | 0;
			P = c[v >> 2] | 0;
			P = ($(P >> 16, N) | 0) + (($(P & 65535, N) | 0) >> 16) | 0;
			Q = c[w >> 2] | 0;
			Q = P + (($(Q >> 16, L) | 0) + (($(Q & 65535, L) | 0) >> 16)) << 1;
			P = c[F >> 2] | 0;
			P = Q + (($(P >> 16, O) | 0) + (($(P & 65535, O) | 0) >> 16)) | 0;
			O = M + (($(P >> 16, O) | 0) + (($(P & 65535, O) | 0) >> 16)) | 0;
			P = c[y >> 2] | 0;
			P = ($(P >> 16, L) | 0) + (($(P & 65535, L) | 0) >> 16) << 1;
			M = c[z >> 2] | 0;
			M = P + (($(M >> 16, N) | 0) + (($(M & 65535, N) | 0) >> 16)) | 0;
			N = O + (($(M >> 16, N) | 0) + (($(M & 65535, N) | 0) >> 16)) | 0;
			M = c[A >> 2] | 0;
			M = ($(M >> 16, L) | 0) + (($(M & 65535, L) | 0) >> 16) | 0;
			L = N + (($(M >> 16, L) | 0) + (($(M & 65535, L) | 0) >> 16)) | 0;
			if ((L | 0) < (c[f >> 2] | 0)) {
				c[f >> 2] = L;
				a[b >> 0] = J;
				c[g >> 2] = K
			}
			k = k + 5 | 0;
			J = J + 1 | 0
		}
		i = t;
		return
	}
	function ff(a, d, e, f, g) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		h = i;
		j = g >> 1;
		k = d + 4 | 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (j | 0)) break;
			o = g << 1;
			p = b[a + (o << 1) >> 1] << 10;
			n = p - (c[d >> 2] | 0) | 0;
			l = ($(n >> 16, -24290) | 0) + (($(n & 65535, -24290) | 0) >> 16) | 0;
			m = p + l | 0;
			c[d >> 2] = p + (n + l);
			o = b[a + ((o | 1) << 1) >> 1] << 10;
			l = c[k >> 2] | 0;
			n = o - l | 0;
			n = ((n >> 16) * 10788 | 0) + (((n & 65535) * 10788 | 0) >>> 16) | 0;
			l = l + n | 0;
			c[k >> 2] = o + n;
			n = (l + m >> 10) + 1 >> 1;
			if ((n | 0) > 32767) n = 32767;
			else n = (n | 0) < -32768 ? -32768 : n & 65535;
			b[e + (g << 1) >> 1] = n;
			l = (l - m >> 10) + 1 >> 1;
			if ((l | 0) > 32767) l = 32767;
			else l = (l | 0) < -32768 ? -32768 : l & 65535;
			b[f + (g << 1) >> 1] = l;
			g = g + 1 | 0
		}
		i = h;
		return
	}
	function gf(a, d, e, f, g, h) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		j = i;
		p = 0 - (c[e >> 2] | 0) | 0;
		k = 0 - (c[e + 4 >> 2] | 0) | 0;
		n = f + 4 | 0;
		o = p & 16383;
		p = p >>> 14 << 16 >> 16;
		q = d + 4 | 0;
		e = k & 16383;
		k = k >>> 14 << 16 >> 16;
		l = d + 8 | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (h | 0)) break;
			s = b[a + (m << 1) >> 1] | 0;
			r = c[d >> 2] | 0;
			r = (c[f >> 2] | 0) + (($(r >> 16, s) | 0) + (($(r & 65535, s) | 0) >> 16)) << 2;
			t = r >> 16;
			u = r & 65532;
			w = (c[n >> 2] | 0) + ((($(t, o) | 0) + (($(u, o) | 0) >>> 16) >> 13) + 1 >> 1) + (($(t, p) | 0) + (($(u, p) | 0) >> 16)) | 0;
			c[f >> 2] = w;
			v = c[q >> 2] | 0;
			c[f >> 2] = w + (($(v >> 16, s) | 0) + (($(v & 65535, s) | 0) >> 16));
			u = ((($(t, e) | 0) + (($(u, e) | 0) >>> 16) >> 13) + 1 >> 1) + (($(t, k) | 0) + (($(u, k) | 0) >> 16)) | 0;
			c[n >> 2] = u;
			t = c[l >> 2] | 0;
			c[n >> 2] = u + (($(t >> 16, s) | 0) + (($(t & 65535, s) | 0) >> 16));
			r = r + 16383 >> 14;
			if ((r | 0) > 32767) r = 32767;
			else r = (r | 0) < -32768 ? -32768 : r & 65535;
			b[g + (m << 1) >> 1] = r;
			m = m + 1 | 0
		}
		i = j;
		return
	}
	function hf(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0;
		e = i;
		f = d + -65536 | 0;
		c = c + -1 | 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (c | 0)) break;
			h = a + (g << 1) | 0;
			b[h >> 1] = ((($(d, b[h >> 1] | 0) | 0) >>> 15) + 1 | 0) >>> 1;
			d = d + ((($(d, f) | 0) >> 15) + 1 >> 1) | 0;
			g = g + 1 | 0
		}
		h = a + (c << 1) | 0;
		b[h >> 1] = ((($(d, b[h >> 1] | 0) | 0) >>> 15) + 1 | 0) >>> 1;
		i = e;
		return
	}
	function jf(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		e = i;
		f = d + -65536 | 0;
		b = b + -1 | 0;
		g = 0;
		while (1) {
			h = d >> 16;
			if ((g | 0) >= (b | 0)) break;
			j = a + (g << 2) | 0;
			k = c[j >> 2] | 0;
			l = k << 16 >> 16;
			c[j >> 2] = ($(h, l) | 0) + (($(d & 65535, l) | 0) >> 16) + ($(d, (k >> 15) + 1 >> 1) | 0);
			d = d + ((($(d, f) | 0) >> 15) + 1 >> 1) | 0;
			g = g + 1 | 0
		}
		l = a + (b << 2) | 0;
		k = c[l >> 2] | 0;
		j = k << 16 >> 16;
		c[l >> 2] = ($(h, j) | 0) + (($(d & 65535, j) | 0) >> 16) + ($(d, (k >> 15) + 1 >> 1) | 0);
		i = e;
		return
	}
	function kf(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		g = c[a + 8 >> 2] | 0;
		do
		if ((g | 0) == 48e3 | (g | 0) == 44100 | (g | 0) == 32e3 | (g | 0) == 24e3 | (g | 0) == 16e3 | (g | 0) == 12e3 | (g | 0) == 8e3) {
			e = c[a + 20 >> 2] | 0;
			if ((e | 0) != 8e3) if ((e | 0) != 12e3) if ((e | 0) == 16e3) e = 16e3;
			else {
				a = -102;
				break
			} else e = 12e3;
			else e = 8e3;
			f = c[a + 12 >> 2] | 0;
			if ((f | 0) != 8e3) if ((f | 0) != 12e3) if ((f | 0) == 16e3) f = 16e3;
			else {
				a = -102;
				break
			} else f = 12e3;
			else f = 8e3;
			g = c[a + 16 >> 2] | 0;
			if ((g | 0) == 12e3) {
				g = 12e3;
				d = 10
			} else if ((g | 0) != 8e3) if ((g | 0) == 16e3) {
				g = 16e3;
				d = 10
			} else {
				a = -102;
				break
			} else g = 8e3;
			if ((d | 0) == 10) if (g >>> 0 > e >>> 0) {
				a = -102;
				break
			}
			if (!(f >>> 0 < e >>> 0 | g >>> 0 > f >>> 0)) {
				g = c[a + 24 >> 2] | 0;
				if ((g | 0) == 60 | (g | 0) == 40 | (g | 0) == 20 | (g | 0) == 10) {
					g = c[a + 32 >> 2] | 0;
					if (!((g | 0) < 0 | (g | 0) > 100)) {
						g = c[a + 44 >> 2] | 0;
						if (!((g | 0) < 0 | (g | 0) > 1)) {
							g = c[a + 48 >> 2] | 0;
							if (!((g | 0) < 0 | (g | 0) > 1)) {
								g = c[a + 40 >> 2] | 0;
								if (!((g | 0) < 0 | (g | 0) > 1)) {
									d = c[a >> 2] | 0;
									if (!((d | 0) < 1 | (d | 0) > 2) ? (g = c[a + 4 >> 2] | 0, !((g | 0) < 1 | (g | 0) > 2 | (g | 0) > (d | 0))) : 0) {
										g = c[a + 36 >> 2] | 0;
										i = b;
										return ((g | 0) < 0 | (g | 0) > 10 ? -106 : 0) | 0
									} else a = -111
								} else a = -107
							} else a = -109
						} else a = -108
					} else a = -105
				} else a = -103
			} else a = -102
		} else a = -102;
		while (0);
		i = b;
		return a | 0
	}
	function lf(b, d, e, f, g, h) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0;
		j = i;
		i = i + 16 | 0;
		k = j;
		a[k + 1 >> 0] = 0;
		f = ((f << 1) + g << 16 >> 16) * 7 | 0;
		e = e + 8 >> 4;
		g = 0;
		while (1) {
			if ((g | 0) >= (e | 0)) break;
			l = c[h + (g << 2) >> 2] | 0;
			a: do
			if ((l | 0) > 0) {
				a[k >> 0] = a[26304 + (f + ((l & 30) >>> 0 < 6 ? l & 31 : 6)) >> 0] | 0;
				m = 0;
				while (1) {
					if ((m | 0) >= 16) break a;
					l = a[d + m >> 0] | 0;
					if (l << 24 >> 24) Cc(b, (l << 24 >> 24 >> 15) + 1 | 0, k, 8);
					m = m + 1 | 0
				}
			}
			while (0);
			d = d + 16 | 0;
			g = g + 1 | 0
		}
		i = j;
		return
	}
	function mf(d, e, f, g, h, j) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		k = i;
		i = i + 16 | 0;
		l = k;
		a[l + 1 >> 0] = 0;
		g = ((g << 1) + h << 16 >> 16) * 7 | 0;
		f = f + 8 >> 4;
		h = 0;
		while (1) {
			if ((h | 0) >= (f | 0)) break;
			m = c[j + (h << 2) >> 2] | 0;
			a: do
			if ((m | 0) > 0) {
				a[l >> 0] = a[26304 + (g + ((m & 30) >>> 0 < 6 ? m & 31 : 6)) >> 0] | 0;
				n = 0;
				while (1) {
					if ((n | 0) >= 16) break a;
					m = e + (n << 1) | 0;
					if ((b[m >> 1] | 0) > 0) {
						o = ((sc(d, l, 8) | 0) << 1) + -1 | 0;
						b[m >> 1] = $(b[m >> 1] | 0, o) | 0
					}
					n = n + 1 | 0
				}
			}
			while (0);
			e = e + 32 | 0;
			h = h + 1 | 0
		}
		i = k;
		return
	}
	function nf(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		if ((d | 0) > 8e4) g = 8e4;
		else g = (d | 0) < 5e3 ? 5e3 : d;
		d = a + 4632 | 0;
		if ((g | 0) == (c[d >> 2] | 0)) {
			i = f;
			return
		}
		c[d >> 2] = g;
		d = c[a + 4600 >> 2] | 0;
		if ((d | 0) == 8) d = 24720;
		else d = (d | 0) == 12 ? 24752 : 24784;
		h = (c[a + 4604 >> 2] | 0) == 2 ? g + -2200 | 0 : g;
		j = 1;
		while (1) {
			if ((j | 0) >= 8) break;
			g = c[d + (j << 2) >> 2] | 0;
			if ((h | 0) <= (g | 0)) {
				e = 9;
				break
			}
			j = j + 1 | 0
		}
		if ((e | 0) == 9) {
			k = j + -1 | 0;
			e = c[d + (k << 2) >> 2] | 0;
			d = b[24816 + (k << 1) >> 1] | 0;
			c[a + 4748 >> 2] = (d << 6) + ($((h - e << 6 | 0) / (g - e | 0) | 0, (b[24816 + (j << 1) >> 1] | 0) - d | 0) | 0)
		}
		if (!(c[a + 6124 >> 2] | 0)) {
			i = f;
			return
		}
		k = a + 4748 | 0;
		c[k >> 2] = (c[k >> 2] | 0) + ($(12 - (c[a + 6128 >> 2] | 0) << 16 >> 16, -31) | 0);
		i = f;
		return
	}
	function of(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		e = i;
		d = c[a + 4600 >> 2] | 0;
		j = d << 16 >> 16;
		f = j * 1e3 | 0;
		if (!j) {
			h = c[a + 4596 >> 2] | 0;
			j = c[a + 4580 >> 2] | 0;
			j = (((h | 0) < (j | 0) ? h : j) | 0) / 1e3 | 0;
			i = e;
			return j | 0
		}
		g = c[a + 4580 >> 2] | 0;
		h = c[a + 4588 >> 2] | 0;
		if (!((f | 0) > (g | 0) | (f | 0) > (h | 0)) ? (f | 0) >= (c[a + 4592 >> 2] | 0) : 0) {
			h = a + 24 | 0;
			g = c[h >> 2] | 0;
			if ((g | 0) > 255) c[a + 28 >> 2] = 0;
			if ((c[a + 4560 >> 2] | 0) == 0 ? (c[b + 60 >> 2] | 0) == 0 : 0) {
				j = d;
				i = e;
				return j | 0
			}
			j = c[a + 4596 >> 2] | 0;
			if ((f | 0) > (j | 0)) {
				f = a + 28 | 0;
				if (!(c[f >> 2] | 0)) {
					c[h >> 2] = 256;
					g = a + 16 | 0;
					c[g >> 2] = 0;
					c[g + 4 >> 2] = 0;
					g = 256
				}
				if (c[b + 60 >> 2] | 0) {
					c[f >> 2] = 0;
					j = (d | 0) == 16 ? 12 : 8;
					i = e;
					return j | 0
				}
				if ((g | 0) < 1) {
					c[b + 84 >> 2] = 1;
					j = b + 52 | 0;
					h = c[j >> 2] | 0;
					c[j >> 2] = h - ((h * 5 | 0) / ((c[b + 24 >> 2] | 0) + 5 | 0) | 0);
					j = d;
					i = e;
					return j | 0
				} else {
					c[f >> 2] = -2;
					j = d;
					i = e;
					return j | 0
				}
			}
			if ((f | 0) >= (j | 0)) {
				b = a + 28 | 0;
				if ((c[b >> 2] | 0) >= 0) {
					j = d;
					i = e;
					return j | 0
				}
				c[b >> 2] = 1;
				j = d;
				i = e;
				return j | 0
			}
			if (c[b + 60 >> 2] | 0) {
				c[h >> 2] = 0;
				j = a + 16 | 0;
				c[j >> 2] = 0;
				c[j + 4 >> 2] = 0;
				c[a + 28 >> 2] = 1;
				j = (d | 0) == 8 ? 12 : 16;
				i = e;
				return j | 0
			}
			a = a + 28 | 0;
			if (!(c[a >> 2] | 0)) {
				c[b + 84 >> 2] = 1;
				j = b + 52 | 0;
				h = c[j >> 2] | 0;
				c[j >> 2] = h - ((h * 5 | 0) / ((c[b + 24 >> 2] | 0) + 5 | 0) | 0);
				j = d;
				i = e;
				return j | 0
			} else {
				c[a >> 2] = 1;
				j = d;
				i = e;
				return j | 0
			}
		}
		h = (g | 0) < (h | 0) ? g : h;
		j = c[a + 4592 >> 2] | 0;
		j = (((h | 0) > (j | 0) ? h : j) | 0) / 1e3 | 0;
		i = e;
		return j | 0
	}
	function pf(a, b, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0;
		h = i;
		c[a + 6108 >> 2] = c[b + 44 >> 2];
		c[a + 4708 >> 2] = c[b + 48 >> 2];
		j = c[b + 8 >> 2] | 0;
		c[a + 4580 >> 2] = j;
		c[a + 4588 >> 2] = c[b + 12 >> 2];
		c[a + 4592 >> 2] = c[b + 16 >> 2];
		c[a + 4596 >> 2] = c[b + 20 >> 2];
		c[a + 6120 >> 2] = c[b + 40 >> 2];
		c[a + 5784 >> 2] = c[b >> 2];
		c[a + 5788 >> 2] = c[b + 4 >> 2];
		c[a + 4560 >> 2] = e;
		c[a + 5792 >> 2] = f;
		f = a + 4700 | 0;
		if ((c[f >> 2] | 0) != 0 ? (c[a + 4712 >> 2] | 0) == 0 : 0) {
			if ((j | 0) == (c[a + 4584 >> 2] | 0)) {
				e = 0;
				i = h;
				return e | 0
			}
			j = c[a + 4600 >> 2] | 0;
			if ((j | 0) <= 0) {
				e = 0;
				i = h;
				return e | 0
			}
			e = qf(a, j) | 0;
			i = h;
			return e | 0
		}
		e = of(a, b) | 0;
		e = (g | 0) == 0 ? e : g;
		g = qf(a, e) | 0;
		e = g + (rf(a, e, c[b + 24 >> 2] | 0) | 0) | 0;
		e = e + (sf(a, c[b + 36 >> 2] | 0) | 0) | 0;
		c[a + 4640 >> 2] = c[b + 32 >> 2];
		e = e + (tf(a, d) | 0) | 0;
		c[f >> 2] = 1;
		i = h;
		return e | 0
	}
	function qf(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		d = i;
		i = i + 304 | 0;
		f = d;
		g = a + 4600 | 0;
		e = c[g >> 2] | 0;
		if ((e | 0) == (b | 0) ? (c[a + 4584 >> 2] | 0) == (c[a + 4580 >> 2] | 0) : 0) {
			b = 0;
			f = a + 4580 | 0;
			f = c[f >> 2] | 0;
			g = a + 4584 | 0;
			c[g >> 2] = f;
			i = d;
			return b | 0
		}
		if (!e) {
			b = vh(a + 5808 | 0, c[a + 4580 >> 2] | 0, b * 1e3 | 0, 1) | 0;
			f = a + 4580 | 0;
			f = c[f >> 2] | 0;
			g = a + 4584 | 0;
			c[g >> 2] = f;
			i = d;
			return b | 0
		} else {
			l = ((c[a + 4604 >> 2] | 0) * 10 | 0) + 5 | 0;
			o = $(l, e) | 0;
			h = $(l, b) | 0;
			e = ta() | 0;
			j = i;
			i = i + ((2 * ((o | 0) > (h | 0) ? o : h) | 0) + 15 & -16) | 0;
			k = a + 9356 | 0;
			wf(j, k, o);
			m = a + 4580 | 0;
			n = vh(f, (c[g >> 2] << 16 >> 16) * 1e3 | 0, c[m >> 2] | 0, 0) | 0;
			g = $(l, (c[m >> 2] | 0) / 1e3 | 0) | 0;
			l = i;
			i = i + ((2 * g | 0) + 15 & -16) | 0;
			wh(f, l, j, o);
			f = a + 5808 | 0;
			b = n + (vh(f, c[m >> 2] | 0, (b << 16 >> 16) * 1e3 | 0, 1) | 0) | 0;
			wh(f, j, l, g);
			xf(k, j, h);
			ja(e | 0);
			f = a + 4580 | 0;
			f = c[f >> 2] | 0;
			g = a + 4584 | 0;
			c[g >> 2] = f;
			i = d;
			return b | 0
		}
		return 0
	}
	function rf(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		f = i;
		j = b + 4636 | 0;
		if ((c[j >> 2] | 0) == (e | 0)) {
			k = b + 4600 | 0;
			g = k;
			k = c[k >> 2] | 0;
			h = 0
		} else {
			k = (e | 0) == 10;
			do
			if (!k) {
				if (!((e | 0) == 60 | (e | 0) == 40 | (e | 0) == 20)) if ((e | 0) < 11) {
					h = -103;
					g = 6;
					break
				} else h = -103;
				else h = 0;
				c[b + 5776 >> 2] = (e | 0) / 20 | 0;
				c[b + 4604 >> 2] = 4;
				k = d << 16 >> 16;
				c[b + 4608 >> 2] = k * 20;
				c[b + 4572 >> 2] = k * 24;
				k = c[b + 4600 >> 2] | 0;
				l = b + 4720 | 0;
				if ((k | 0) == 8) {
					c[l >> 2] = 25232;
					k = 8;
					break
				} else {
					c[l >> 2] = 25192;
					break
				}
			} else {
				h = 0;
				g = 6
			}
			while (0);
			do
			if ((g | 0) == 6) {
				c[b + 5776 >> 2] = 1;
				c[b + 4604 >> 2] = k ? 2 : 1;
				k = d << 16 >> 16;
				c[b + 4608 >> 2] = $(e << 16 >> 16, k) | 0;
				c[b + 4572 >> 2] = k * 14;
				k = c[b + 4600 >> 2] | 0;
				g = b + 4720 | 0;
				if ((k | 0) == 8) {
					c[g >> 2] = 25264;
					k = 8;
					break
				} else {
					c[g >> 2] = 25248;
					break
				}
			}
			while (0);
			c[j >> 2] = e;
			c[b + 4632 >> 2] = 0;
			g = b + 4600 | 0
		}
		if ((k | 0) == (d | 0)) {
			i = f;
			return h | 0
		}
		e = b + 7200 | 0;
		j = b + 16 | 0;
		c[j >> 2] = 0;
		c[j + 4 >> 2] = 0;
		c[b + 5772 >> 2] = 0;
		c[b + 5780 >> 2] = 0;
		c[b + 4632 >> 2] = 0;
		wj(b + 144 | 0, 0, 4412) | 0;
		wj(e | 0, 0, 2152) | 0;
		c[b + 4568 >> 2] = 100;
		c[b + 4696 >> 2] = 1;
		c[b + 9352 >> 2] = 100;
		a[e >> 0] = 10;
		c[b + 4500 >> 2] = 100;
		c[b + 4516 >> 2] = 65536;
		a[b + 4565 >> 0] = 0;
		c[g >> 2] = d;
		e = (d | 0) == 8;
		j = c[b + 4604 >> 2] | 0;
		k = (j | 0) == 4;
		g = b + 4720 | 0;
		do
		if (e) if (k) {
			c[g >> 2] = 25232;
			j = 4;
			g = 21;
			break
		} else {
			c[g >> 2] = 25264;
			e = j;
			j = 8;
			g = 23;
			break
		} else if (k) {
			c[g >> 2] = 25192;
			j = 4;
			g = 21;
			break
		} else {
			c[g >> 2] = 25248;
			e = j;
			g = 22;
			break
		}
		while (0);
		if ((g | 0) == 21) if (e) {
			e = j;
			j = 8;
			g = 23
		} else {
			e = j;
			g = 22
		}
		if ((g | 0) == 22) if ((d | 0) == 12) {
			j = 12;
			g = 23
		} else {
			c[b + 4664 >> 2] = 16;
			c[b + 4724 >> 2] = 24608;
			j = d
		}
		if ((g | 0) == 23) {
			c[b + 4664 >> 2] = 10;
			c[b + 4724 >> 2] = 23520
		}
		c[b + 4612 >> 2] = d * 5;
		c[b + 4608 >> 2] = $(d * 327680 >> 16, e << 16 >> 16) | 0;
		l = d << 16;
		d = l >> 16;
		c[b + 4616 >> 2] = d * 20;
		c[b + 4620 >> 2] = l >> 15;
		c[b + 4576 >> 2] = d * 18;
		if ((e | 0) == 4) c[b + 4572 >> 2] = d * 24;
		else c[b + 4572 >> 2] = d * 14;
		if ((j | 0) == 12) {
			c[b + 4684 >> 2] = 13;
			c[b + 4716 >> 2] = 25008;
			i = f;
			return h | 0
		} else if ((j | 0) == 16) {
			c[b + 4684 >> 2] = 10;
			c[b + 4716 >> 2] = 25016;
			i = f;
			return h | 0
		} else {
			c[b + 4684 >> 2] = 15;
			c[b + 4716 >> 2] = 24992;
			i = f;
			return h | 0
		}
		return 0
	}
	function sf(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		d = i;
		do
		if ((b | 0) >= 2) {
			if ((b | 0) < 4) {
				c[a + 4668 >> 2] = 1;
				c[a + 4676 >> 2] = 49807;
				c[a + 4672 >> 2] = 8;
				c[a + 4660 >> 2] = 10;
				f = c[a + 4600 >> 2] | 0;
				e = f * 5 | 0;
				c[a + 4624 >> 2] = e;
				c[a + 4652 >> 2] = 1;
				c[a + 4656 >> 2] = 0;
				c[a + 4680 >> 2] = 0;
				c[a + 4692 >> 2] = 4;
				c[a + 4704 >> 2] = 0;
				g = 8;
				break
			}
			if ((b | 0) < 6) {
				c[a + 4668 >> 2] = 1;
				c[a + 4676 >> 2] = 48497;
				c[a + 4672 >> 2] = 10;
				c[a + 4660 >> 2] = 12;
				f = c[a + 4600 >> 2] | 0;
				e = f * 5 | 0;
				c[a + 4624 >> 2] = e;
				c[a + 4652 >> 2] = 2;
				c[a + 4656 >> 2] = 1;
				c[a + 4680 >> 2] = 0;
				c[a + 4692 >> 2] = 8;
				c[a + 4704 >> 2] = f * 983;
				g = 10;
				break
			}
			e = a + 4668 | 0;
			if ((b | 0) < 8) {
				c[e >> 2] = 1;
				c[a + 4676 >> 2] = 47186;
				c[a + 4672 >> 2] = 12;
				c[a + 4660 >> 2] = 14;
				f = c[a + 4600 >> 2] | 0;
				e = f * 5 | 0;
				c[a + 4624 >> 2] = e;
				c[a + 4652 >> 2] = 3;
				c[a + 4656 >> 2] = 1;
				c[a + 4680 >> 2] = 0;
				c[a + 4692 >> 2] = 16;
				c[a + 4704 >> 2] = f * 983;
				g = 12;
				break
			} else {
				c[e >> 2] = 2;
				c[a + 4676 >> 2] = 45875;
				c[a + 4672 >> 2] = 16;
				c[a + 4660 >> 2] = 16;
				f = c[a + 4600 >> 2] | 0;
				e = f * 5 | 0;
				c[a + 4624 >> 2] = e;
				c[a + 4652 >> 2] = 4;
				c[a + 4656 >> 2] = 1;
				c[a + 4680 >> 2] = 0;
				c[a + 4692 >> 2] = 32;
				c[a + 4704 >> 2] = f * 983;
				g = 16;
				break
			}
		} else {
			c[a + 4668 >> 2] = 0;
			c[a + 4676 >> 2] = 52429;
			c[a + 4672 >> 2] = 6;
			c[a + 4660 >> 2] = 8;
			f = c[a + 4600 >> 2] | 0;
			e = f * 3 | 0;
			c[a + 4624 >> 2] = e;
			c[a + 4652 >> 2] = 1;
			c[a + 4656 >> 2] = 0;
			c[a + 4680 >> 2] = 1;
			c[a + 4692 >> 2] = 2;
			c[a + 4704 >> 2] = 0;
			g = 6
		}
		while (0);
		c[a + 4672 >> 2] = vf(g, c[a + 4664 >> 2] | 0) | 0;
		c[a + 4628 >> 2] = (f * 5 | 0) + (e << 1);
		c[a + 4648 >> 2] = b;
		i = d;
		return 0
	}
	function tf(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		e = a + 6124 | 0;
		c[e >> 2] = 0;
		if (!(c[a + 6120 >> 2] | 0)) {
			i = d;
			return 0
		}
		f = c[a + 4640 >> 2] | 0;
		if ((f | 0) <= 0) {
			i = d;
			return 0
		}
		g = c[a + 4600 >> 2] | 0;
		if ((g | 0) == 8) g = 12e3;
		else g = (g | 0) == 12 ? 14e3 : 16e3;
		if ((f | 0) < 25) {
			j = f;
			h = f
		} else {
			j = 25;
			h = 25
		}
		if ((((($(g, 125 - j | 0) | 0) >> 16) * 655 | 0) + (((($(g, 125 - h | 0) | 0) & 65520) * 655 | 0) >>> 16) | 0) >= (b | 0)) {
			i = d;
			return 0
		}
		c[e >> 2] = 1;
		c[a + 6128 >> 2] = uf(7 - (((f >> 16) * 26214 | 0) + (((f & 65535) * 26214 | 0) >>> 16)) | 0) | 0;
		i = d;
		return 0
	}
	function uf(a) {
		a = a | 0;
		return ((a | 0) > 2 ? a : 2) | 0
	}
	function vf(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function wf(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			d = c + (f << 2) | 0;
			if ((sa(+(+g[d >> 2])) | 0) <= 32767) if ((sa(+(+g[d >> 2])) | 0) < -32768) d = -32768;
			else d = (sa(+(+g[d >> 2])) | 0) & 65535;
			else d = 32767;
			b[a + (f << 1) >> 1] = d;
			d = f
		}
		i = e;
		return
	}
	function xf(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			g[a + (f << 2) >> 2] = +(b[c + (f << 1) >> 1] | 0);
			d = f
		}
		i = e;
		return
	}
	function yf(a) {
		a = a | 0;
		c[a >> 2] = 8544;
		return 0
	}
	function zf(a) {
		a = a | 0;
		var d = 0,
			e = 0;
		d = i;
		e = 0;
		while (1) {
			if ((e | 0) >= 2) break;
			kh(a + (e * 4260 | 0) | 0);
			e = e + 1 | 0
		}
		e = a + 8520 | 0;
		b[e + 0 >> 1] = 0;
		b[e + 2 >> 1] = 0;
		b[e + 4 >> 1] = 0;
		b[e + 6 >> 1] = 0;
		b[e + 8 >> 1] = 0;
		b[e + 10 >> 1] = 0;
		c[a + 8540 >> 2] = 0;
		i = d;
		return 0
	}
	function Af(d, f, g, h, j, k, l, m) {
		d = d | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0;
		n = i;
		i = i + 672 | 0;
		o = n + 20 | 0;
		t = n + 16 | 0;
		p = n + 8 | 0;
		s = n;
		y = n + 24 | 0;
		c[o >> 2] = 0;
		q = s;
		c[q >> 2] = 0;
		c[q + 4 >> 2] = 0;
		q = f + 4 | 0;
		a: do
		if (!h) B = c[q >> 2] | 0;
		else {
			h = 0;
			while (1) {
				B = c[q >> 2] | 0;
				if ((h | 0) >= (B | 0)) break a;
				c[d + (h * 4260 | 0) + 2388 >> 2] = 0;
				h = h + 1 | 0
			}
		}
		while (0);
		h = f + 4 | 0;
		q = d + 8536 | 0;
		if ((B | 0) > (c[q >> 2] | 0)) {
			kh(d + 4260 | 0);
			B = c[h >> 2] | 0
		}
		if ((B | 0) == 1 ? (c[q >> 2] | 0) == 2 : 0) r = (c[f + 12 >> 2] | 0) == ((c[d + 2316 >> 2] | 0) * 1e3 | 0);
		else r = 0;
		v = d + 2388 | 0;
		b: do
		if (!(c[v >> 2] | 0)) {
			w = f + 16 | 0;
			u = f + 12 | 0;
			z = f + 8 | 0;
			x = 0;
			A = 0;
			c: while (1) {
				if ((A | 0) >= (B | 0)) break b;
				switch (c[w >> 2] | 0) {
				case 20:
					{
						c[d + (A * 4260 | 0) + 2392 >> 2] = 1;
						c[d + (A * 4260 | 0) + 2324 >> 2] = 4;
						break
					};
				case 60:
					{
						c[d + (A * 4260 | 0) + 2392 >> 2] = 3;
						c[d + (A * 4260 | 0) + 2324 >> 2] = 4;
						break
					};
				case 10:
					{
						c[d + (A * 4260 | 0) + 2392 >> 2] = 1;
						c[d + (A * 4260 | 0) + 2324 >> 2] = 2;
						break
					};
				case 40:
					{
						c[d + (A * 4260 | 0) + 2392 >> 2] = 2;
						c[d + (A * 4260 | 0) + 2324 >> 2] = 4;
						break
					};
				case 0:
					{
						c[d + (A * 4260 | 0) + 2392 >> 2] = 1;
						c[d + (A * 4260 | 0) + 2324 >> 2] = 2;
						break
					};
				default:
					{
						d = -203;
						z = 120;
						break c
					}
				}
				B = (c[u >> 2] >> 10) + 1 | 0;
				if (!((B | 0) == 16 | (B | 0) == 12 | (B | 0) == 8)) {
					d = -200;
					z = 120;
					break
				}
				G = x + (Kf(d + (A * 4260 | 0) | 0, B, c[z >> 2] | 0) | 0) | 0;
				B = c[h >> 2] | 0;
				x = G;
				A = A + 1 | 0
			}
			if ((z | 0) == 120) {
				i = n;
				return d | 0
			}
		} else x = 0;
		while (0);
		u = c[f >> 2] | 0;
		do
		if ((u | 0) == 2) if ((B | 0) == 2) {
			if ((c[d + 8532 >> 2] | 0) != 1 ? (c[q >> 2] | 0) != 1 : 0) {
				u = 2;
				break
			}
			u = d + 8520 | 0;
			b[u >> 1] = 0;
			b[u + 2 >> 1] = 0 >>> 16;
			u = d + 8528 | 0;
			b[u >> 1] = 0;
			b[u + 2 >> 1] = 0 >>> 16;
			yj(d + 6692 | 0, d + 2432 | 0, 300) | 0;
			u = c[f >> 2] | 0
		} else u = 2;
		while (0);
		c[d + 8532 >> 2] = u;
		c[q >> 2] = c[h >> 2];
		w = f + 8 | 0;
		G = c[w >> 2] | 0;
		if ((G | 0) > 48e3 | (G | 0) < 8e3) {
			G = -200;
			i = n;
			return G | 0
		}
		u = (g | 0) == 1;
		d: do
		if (!u ? (c[v >> 2] | 0) == 0 : 0) {
			z = 0;
			while (1) {
				E = c[h >> 2] | 0;
				if ((z | 0) >= (E | 0)) {
					z = 0;
					break
				}
				A = d + (z * 4260 | 0) + 2392 | 0;
				C = 0;
				while (1) {
					G = (C | 0) < (c[A >> 2] | 0);
					B = rc(j, 1) | 0;
					if (!G) break;
					c[d + (z * 4260 | 0) + (C << 2) + 2404 >> 2] = B;
					C = C + 1 | 0
				}
				c[d + (z * 4260 | 0) + 2416 >> 2] = B;
				z = z + 1 | 0
			}
			while (1) {
				if ((z | 0) >= (E | 0)) break;
				G = d + (z * 4260 | 0) + 2420 | 0;
				c[G + 0 >> 2] = 0;
				c[G + 4 >> 2] = 0;
				c[G + 8 >> 2] = 0;
				e: do
				if (c[d + (z * 4260 | 0) + 2416 >> 2] | 0) {
					A = d + (z * 4260 | 0) + 2392 | 0;
					B = c[A >> 2] | 0;
					if ((B | 0) == 1) {
						c[d + (z * 4260 | 0) + 2420 >> 2] = 1;
						break
					}
					C = (sc(j, c[24920 + (B + -2 << 2) >> 2] | 0, 8) | 0) + 1 | 0;
					B = 0;
					while (1) {
						if ((B | 0) >= (c[A >> 2] | 0)) break e;
						c[d + (z * 4260 | 0) + (B << 2) + 2420 >> 2] = C >>> B & 1;
						B = B + 1 | 0
					}
				}
				while (0);
				E = c[h >> 2] | 0;
				z = z + 1 | 0
			}
			if (!g) {
				z = d + 2392 | 0;
				B = 0;
				while (1) {
					if ((B | 0) >= (c[z >> 2] | 0)) break d;
					C = d + (B << 2) + 6680 | 0;
					A = B + -1 | 0;
					D = 0;
					while (1) {
						if ((D | 0) >= (E | 0)) break;
						if (c[d + (D * 4260 | 0) + (B << 2) + 2420 >> 2] | 0) {
							if ((E | 0) == 2 & (D | 0) == 0 ? (Th(j, s), (c[C >> 2] | 0) == 0) : 0) Uh(j, o);
							if ((B | 0) > 0 ? (c[d + (D * 4260 | 0) + (A << 2) + 2420 >> 2] | 0) != 0 : 0) E = 2;
							else E = 0;
							Gf(d + (D * 4260 | 0) | 0, j, B, 1, E);
							Jf(j, y, a[d + (D * 4260 | 0) + 2765 >> 0] | 0, a[d + (D * 4260 | 0) + 2766 >> 0] | 0, c[d + (D * 4260 | 0) + 2328 >> 2] | 0);
							E = c[h >> 2] | 0
						}
						D = D + 1 | 0
					}
					B = B + 1 | 0
				}
			}
		}
		while (0);
		y = c[h >> 2] | 0;
		if ((y | 0) == 2) {
			if ((g | 0) == 2) if ((c[d + (c[v >> 2] << 2) + 2420 >> 2] | 0) == 1) {
				Th(j, s);
				if (!(c[d + (c[v >> 2] << 2) + 6680 >> 2] | 0)) z = 62;
				else z = 63
			} else {
				y = 0;
				z = 64
			} else if (!g) {
				Th(j, s);
				if (!(c[d + (c[v >> 2] << 2) + 6664 >> 2] | 0)) z = 62;
				else z = 63
			} else {
				y = 0;
				z = 64
			}
			f: do
			if ((z | 0) == 62) Uh(j, o);
			else if ((z | 0) == 63) c[o >> 2] = 0;
			else if ((z | 0) == 64) while (1) {
				if ((y | 0) >= 2) break f;
				c[s + (y << 2) >> 2] = b[d + (y << 1) + 8520 >> 1];
				y = y + 1 | 0;
				z = 64
			}
			while (0);
			y = c[h >> 2] | 0;
			if ((y | 0) == 2) if ((c[o >> 2] | 0) == 0 ? (c[d + 8540 >> 2] | 0) == 1 : 0) {
				wj(d + 5544 | 0, 0, 1024) | 0;
				c[d + 6568 >> 2] = 100;
				a[d + 6572 >> 0] = 10;
				c[d + 8424 >> 2] = 0;
				c[d + 6636 >> 2] = 1;
				y = c[h >> 2] | 0
			} else y = 2
		}
		A = $(c[f + 12 >> 2] | 0, y) | 0;
		A = (A | 0) < ($(c[w >> 2] | 0, c[f >> 2] | 0) | 0);
		if (A) {
			y = ta() | 0;
			c[p >> 2] = k;
			C = k + ((c[d + 2328 >> 2] | 0) + 2 << 1) | 0;
			c[p + 4 >> 2] = C;
			B = k
		} else {
			C = $(y, (c[d + 2328 >> 2] | 0) + 2 | 0) | 0;
			y = ta() | 0;
			B = i;
			i = i + ((2 * C | 0) + 15 & -16) | 0;
			c[p >> 2] = B;
			C = B + ((c[d + 2328 >> 2] | 0) + 2 << 1) | 0;
			c[p + 4 >> 2] = C
		}
		if (!g) {
			z = d + 8540 | 0;
			E = (c[o >> 2] | 0) == 0 & 1
		} else {
			z = d + 8540 | 0;
			if (c[z >> 2] | 0) if ((c[h >> 2] | 0) == 2 & (g | 0) == 2) D = (c[d + (c[d + 6648 >> 2] << 2) + 6680 >> 2] | 0) == 1;
			else D = 0;
			else D = 1;
			E = D & 1
		}
		D = (g | 0) == 2;
		E = (E | 0) == 0;
		F = 0;
		while (1) {
			G = c[h >> 2] | 0;
			if ((F | 0) >= (G | 0)) break;
			if ((F | 0) == 0 | E ^ 1) {
				G = (c[v >> 2] | 0) - F | 0;
				do
				if ((G | 0) < 1) G = 0;
				else {
					if (D) {
						G = (c[d + (F * 4260 | 0) + (G + -1 << 2) + 2420 >> 2] | 0) != 0 ? 2 : 0;
						break
					}
					if ((F | 0) > 0 ? (c[z >> 2] | 0) != 0 : 0) {
						G = 1;
						break
					}
					G = 2
				}
				while (0);
				x = x + (Ff(d + (F * 4260 | 0) | 0, j, (c[p + (F << 2) >> 2] | 0) + 4 | 0, t, g, G, m) | 0) | 0
			} else wj((c[p + (F << 2) >> 2] | 0) + 4 | 0, 0, c[t >> 2] << 1 | 0) | 0;
			G = d + (F * 4260 | 0) + 2388 | 0;
			c[G >> 2] = (c[G >> 2] | 0) + 1;
			F = F + 1 | 0
		}
		if ((c[f >> 2] | 0) == 2 & (G | 0) == 2) {
			j = d + 2316 | 0;
			g = c[t >> 2] | 0;
			Sh(d + 8520 | 0, B, C, s, c[j >> 2] | 0, g)
		} else {
			j = d + 8524 | 0;
			g = e[j >> 1] | e[j + 2 >> 1] << 16;
			b[B >> 1] = g;
			b[B + 2 >> 1] = g >>> 16;
			g = c[t >> 2] | 0;
			G = B + (g << 1) | 0;
			G = e[G >> 1] | e[G + 2 >> 1] << 16;
			b[j >> 1] = G;
			b[j + 2 >> 1] = G >>> 16;
			j = d + 2316 | 0
		}
		s = $(g, c[w >> 2] | 0) | 0;
		s = (s | 0) / ((c[j >> 2] << 16 >> 16) * 1e3 | 0) | 0;
		c[l >> 2] = s;
		t = c[f >> 2] | 0;
		if ((t | 0) == 2) {
			G = i;
			i = i + ((2 * s | 0) + 15 & -16) | 0;
			s = G
		} else s = k;
		if (A) {
			G = (c[d + 2328 >> 2] | 0) + 2 | 0;
			F = $(c[h >> 2] | 0, G) | 0;
			B = i;
			i = i + ((2 * F | 0) + 15 & -16) | 0;
			yj(B | 0, k | 0, F << 1 | 0) | 0;
			c[p >> 2] = B;
			c[p + 4 >> 2] = B + (G << 1)
		}
		v = t;
		t = 0;
		while (1) {
			m = c[h >> 2] | 0;
			if ((t | 0) >= (((v | 0) < (m | 0) ? v : m) | 0)) break;
			wh(d + (t * 4260 | 0) + 2432 | 0, s, (c[p + (t << 2) >> 2] | 0) + 2 | 0, g);
			v = c[f >> 2] | 0;
			if ((v | 0) == 2) {
				m = 0;
				while (1) {
					if ((m | 0) >= (c[l >> 2] | 0)) break;
					b[k + (t + (m << 1) << 1) >> 1] = b[s + (m << 1) >> 1] | 0;
					m = m + 1 | 0
				}
				v = c[f >> 2] | 0
			}
			t = t + 1 | 0
		}
		g: do
		if ((v | 0) == 2 & (m | 0) == 1) {
			if (!r) {
				p = 0;
				while (1) {
					if ((p | 0) >= (c[l >> 2] | 0)) break g;
					G = p << 1;
					b[k + ((G | 1) << 1) >> 1] = b[k + (G << 1) >> 1] | 0;
					p = p + 1 | 0
				}
			}
			wh(d + 6692 | 0, s, B + 2 | 0, g);
			p = 0;
			while (1) {
				if ((p | 0) >= (c[l >> 2] | 0)) break g;
				b[k + ((p << 1 | 1) << 1) >> 1] = b[s + (p << 1) >> 1] | 0;
				p = p + 1 | 0
			}
		}
		while (0);
		if ((c[d + 4164 >> 2] | 0) == 2) c[f + 20 >> 2] = $(c[d + 2308 >> 2] | 0, c[21248 + ((c[j >> 2] | 0) + -8 >> 2 << 2) >> 2] | 0) | 0;
		else c[f + 20 >> 2] = 0;
		h: do
		if (u) {
			o = 0;
			while (1) {
				if ((o | 0) >= (c[q >> 2] | 0)) break h;
				a[d + (o * 4260 | 0) + 2312 >> 0] = 10;
				o = o + 1 | 0
			}
		} else c[z >> 2] = c[o >> 2];
		while (0);
		ja(y | 0);
		G = x;
		i = n;
		return G | 0
	}
	function Bf(d, e, f, g, h) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0;
		o = i;
		i = i + 32 | 0;
		r = o;
		k = d + 2336 | 0;
		n = c[k >> 2] | 0;
		j = i;
		i = i + ((2 * n | 0) + 15 & -16) | 0;
		t = d + 2328 | 0;
		z = c[t >> 2] | 0;
		q = i;
		i = i + ((4 * (n + z | 0) | 0) + 15 & -16) | 0;
		n = d + 2332 | 0;
		m = c[n >> 2] | 0;
		p = i;
		i = i + ((4 * m | 0) + 15 & -16) | 0;
		l = i;
		i = i + ((4 * (m + 16 | 0) | 0) + 15 & -16) | 0;
		m = d + 2765 | 0;
		x = (a[d + 2767 >> 0] | 0) < 4 ? 1 : 0;
		v = b[24968 + (a[m >> 0] >> 1 << 2) + (a[d + 2766 >> 0] << 1) >> 1] << 4;
		w = a[d + 2770 >> 0] | 0;
		u = 0;
		while (1) {
			if ((u | 0) >= (z | 0)) break;
			w = ($(w, 196314165) | 0) + 907633515 | 0;
			y = g + (u << 1) | 0;
			A = b[y >> 1] | 0;
			B = A << 16 >> 16 << 14;
			z = d + (u << 2) + 4 | 0;
			c[z >> 2] = B;
			if (A << 16 >> 16 <= 0) {
				if (A << 16 >> 16 < 0) {
					B = B | 1280;
					c[z >> 2] = B
				}
			} else {
				B = B + -1280 | 0;
				c[z >> 2] = B
			}
			da = B + v | 0;
			c[z >> 2] = (w | 0) < 0 ? 0 - da | 0 : da;
			z = c[t >> 2] | 0;
			w = w + (b[y >> 1] | 0) | 0;
			u = u + 1 | 0
		}
		g = d + 1284 | 0;
		T = l + 0 | 0;
		U = g + 0 | 0;
		S = T + 64 | 0;
		do {
			c[T >> 2] = c[U >> 2];
			T = T + 4 | 0;
			U = U + 4 | 0
		} while ((T | 0) < (S | 0));
		t = d + 2324 | 0;
		w = d + 2340 | 0;
		v = d + 4160 | 0;
		u = e + 136 | 0;
		z = (x | 0) == 0;
		R = r + 2 | 0;
		I = r + 4 | 0;
		H = r + 6 | 0;
		G = r + 8 | 0;
		F = r + 10 | 0;
		E = r + 12 | 0;
		D = r + 14 | 0;
		C = r + 16 | 0;
		B = r + 18 | 0;
		L = r + 20 | 0;
		M = r + 22 | 0;
		N = r + 24 | 0;
		O = r + 26 | 0;
		P = r + 28 | 0;
		Q = r + 30 | 0;
		y = d + 4164 | 0;
		K = d + 2308 | 0;
		x = d + 4 | 0;
		J = f;
		V = c[k >> 2] | 0;
		A = 0;
		while (1) {
			if ((A | 0) >= (c[t >> 2] | 0)) break;
			Z = e + (A >> 1 << 5) + 32 | 0;
			yj(r | 0, Z | 0, c[w >> 2] << 1 | 0) | 0;
			W = A * 5 | 0;
			U = e + (W << 1) + 96 | 0;
			aa = a[m >> 0] | 0;
			X = aa << 24 >> 24;
			S = c[e + (A << 2) + 16 >> 2] | 0;
			T = S >>> 6;
			Y = Cf(S) | 0;
			_ = c[d >> 2] | 0;
			a: do
			if ((S | 0) == (_ | 0)) _ = 65536;
			else {
				_ = Df(_, S) | 0;
				ba = _ >> 16;
				ca = _ & 65535;
				da = 0;
				while (1) {
					if ((da | 0) >= 16) break a;
					ea = l + (da << 2) | 0;
					fa = c[ea >> 2] | 0;
					ga = fa << 16 >> 16;
					c[ea >> 2] = ($(ba, ga) | 0) + (($(ca, ga) | 0) >> 16) + ($(_, (fa >> 15) + 1 >> 1) | 0);
					da = da + 1 | 0
				}
			}
			while (0);
			c[d >> 2] = S;
			if ((c[v >> 2] | 0) != 0 ? (((c[y >> 2] | 0) != 2 | aa << 24 >> 24 == 2) ^ 1) & (A | 0) < 2 : 0) {
				b[U + 0 >> 1] = 0;
				b[U + 2 >> 1] = 0;
				b[U + 4 >> 1] = 0;
				b[U + 6 >> 1] = 0;
				b[U + 8 >> 1] = 0;
				b[e + (W + 2 << 1) + 96 >> 1] = 4096;
				c[e + (A << 2) >> 2] = c[K >> 2];
				s = 18
			} else if ((X | 0) == 2) s = 18;
			else U = x;
			b: do
			if ((s | 0) == 18) {
				s = 0;
				X = c[e + (A << 2) >> 2] | 0;
				aa = (A | 0) == 0;
				c: do
				if (!aa) {
					if (!((A | 0) == 2 ^ 1 | z)) {
						_ = c[k >> 2] | 0;
						ba = _ - X - (c[w >> 2] | 0) + -2 | 0;
						yj(d + (_ << 1) + 1348 | 0, f | 0, c[n >> 2] << 2 | 0) | 0;
						_ = c[k >> 2] | 0;
						ca = c[w >> 2] | 0;
						s = 22;
						break
					}
					if ((_ | 0) != 65536) {
						ba = X + 2 | 0;
						Y = _ >> 16;
						aa = _ & 65535;
						Z = 0;
						while (1) {
							if ((Z | 0) >= (ba | 0)) break c;
							ga = q + (V - Z + -1 << 2) | 0;
							fa = c[ga >> 2] | 0;
							ea = fa << 16 >> 16;
							c[ga >> 2] = ($(Y, ea) | 0) + (($(aa, ea) | 0) >> 16) + ($(_, (fa >> 15) + 1 >> 1) | 0);
							Z = Z + 1 | 0
						}
					}
				} else {
					_ = c[k >> 2] | 0;
					ca = c[w >> 2] | 0;
					ba = _ - X - ca + -2 | 0;
					s = 22
				}
				while (0);
				d: do
				if ((s | 0) == 22) {
					s = 0;
					Sd(j + (ba << 1) | 0, d + (ba + ($(A, c[n >> 2] | 0) | 0) << 1) + 1348 | 0, Z, _ - ba | 0, ca, h);
					if (aa) {
						ga = c[u >> 2] << 16 >> 16;
						Y = ($(Y >> 16, ga) | 0) + (($(Y & 65535, ga) | 0) >> 16) << 2
					}
					_ = X + 2 | 0;
					Z = Y >> 16;
					Y = Y & 65535;
					aa = 0;
					while (1) {
						if ((aa | 0) >= (_ | 0)) break d;
						ga = b[j + ((c[k >> 2] | 0) - aa + -1 << 1) >> 1] | 0;
						c[q + (V - aa + -1 << 2) >> 2] = ($(Z, ga) | 0) + (($(Y, ga) | 0) >> 16);
						aa = aa + 1 | 0
					}
				}
				while (0);
				_ = e + (W + 1 << 1) + 96 | 0;
				Z = e + (W + 2 << 1) + 96 | 0;
				Y = e + (W + 3 << 1) + 96 | 0;
				aa = e + (W + 4 << 1) + 96 | 0;
				W = c[n >> 2] | 0;
				X = q + (V - X + 2 << 2) | 0;
				ba = 0;
				while (1) {
					if ((ba | 0) >= (W | 0)) {
						U = p;
						break b
					}
					fa = c[X >> 2] | 0;
					ga = b[U >> 1] | 0;
					ga = ($(fa >> 16, ga) | 0) + (($(fa & 65535, ga) | 0) >> 16) + 2 | 0;
					fa = c[X + -4 >> 2] | 0;
					ea = b[_ >> 1] | 0;
					ea = ga + (($(fa >> 16, ea) | 0) + (($(fa & 65535, ea) | 0) >> 16)) | 0;
					fa = c[X + -8 >> 2] | 0;
					ga = b[Z >> 1] | 0;
					ga = ea + (($(fa >> 16, ga) | 0) + (($(fa & 65535, ga) | 0) >> 16)) | 0;
					fa = c[X + -12 >> 2] | 0;
					ea = b[Y >> 1] | 0;
					ea = ga + (($(fa >> 16, ea) | 0) + (($(fa & 65535, ea) | 0) >> 16)) | 0;
					fa = c[X + -16 >> 2] | 0;
					ga = b[aa >> 1] | 0;
					ga = ea + (($(fa >> 16, ga) | 0) + (($(fa & 65535, ga) | 0) >> 16)) | 0;
					ga = (c[x + (ba << 2) >> 2] | 0) + (ga << 1) | 0;
					c[p + (ba << 2) >> 2] = ga;
					c[q + (V << 2) >> 2] = ga << 1;
					X = X + 4 | 0;
					V = V + 1 | 0;
					ba = ba + 1 | 0
				}
			}
			while (0);
			T = T << 16 >> 16;
			S = (S >> 21) + 1 >> 1;
			W = 0;
			while (1) {
				X = c[n >> 2] | 0;
				if ((W | 0) >= (X | 0)) break;
				ga = c[l + (W + 15 << 2) >> 2] | 0;
				fa = b[r >> 1] | 0;
				fa = (c[w >> 2] >> 1) + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
				ga = c[l + (W + 14 << 2) >> 2] | 0;
				X = b[R >> 1] | 0;
				X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
				ga = c[l + (W + 13 << 2) >> 2] | 0;
				fa = b[I >> 1] | 0;
				fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
				ga = c[l + (W + 12 << 2) >> 2] | 0;
				X = b[H >> 1] | 0;
				X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
				ga = c[l + (W + 11 << 2) >> 2] | 0;
				fa = b[G >> 1] | 0;
				fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
				ga = c[l + (W + 10 << 2) >> 2] | 0;
				X = b[F >> 1] | 0;
				X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
				ga = c[l + (W + 9 << 2) >> 2] | 0;
				fa = b[E >> 1] | 0;
				fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
				ga = c[l + (W + 8 << 2) >> 2] | 0;
				X = b[D >> 1] | 0;
				X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
				ga = c[l + (W + 7 << 2) >> 2] | 0;
				fa = b[C >> 1] | 0;
				fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
				ga = c[l + (W + 6 << 2) >> 2] | 0;
				X = b[B >> 1] | 0;
				X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
				if ((c[w >> 2] | 0) == 16) {
					ga = c[l + (W + 5 << 2) >> 2] | 0;
					fa = b[L >> 1] | 0;
					fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
					ga = c[l + (W + 4 << 2) >> 2] | 0;
					X = b[M >> 1] | 0;
					X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
					ga = c[l + (W + 3 << 2) >> 2] | 0;
					fa = b[N >> 1] | 0;
					fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
					ga = c[l + (W + 2 << 2) >> 2] | 0;
					X = b[O >> 1] | 0;
					X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0;
					ga = c[l + (W + 1 << 2) >> 2] | 0;
					fa = b[P >> 1] | 0;
					fa = X + (($(ga >> 16, fa) | 0) + (($(ga & 65535, fa) | 0) >> 16)) | 0;
					ga = c[l + (W << 2) >> 2] | 0;
					X = b[Q >> 1] | 0;
					X = fa + (($(ga >> 16, X) | 0) + (($(ga & 65535, X) | 0) >> 16)) | 0
				}
				X = (c[U + (W << 2) >> 2] | 0) + (X << 4) | 0;
				c[l + (W + 16 << 2) >> 2] = X;
				X = (($(X >> 16, T) | 0) + (($(X & 65535, T) | 0) >> 16) + ($(X, S) | 0) >> 7) + 1 >> 1;
				if ((X | 0) > 32767) X = 32767;
				else X = (X | 0) < -32768 ? -32768 : X & 65535;
				b[J + (W << 1) >> 1] = X;
				W = W + 1 | 0
			}
			T = l + 0 | 0;
			U = l + (X << 2) + 0 | 0;
			S = T + 64 | 0;
			do {
				c[T >> 2] = c[U >> 2];
				T = T + 4 | 0;
				U = U + 4 | 0
			} while ((T | 0) < (S | 0));
			x = x + (X << 2) | 0;
			J = J + (X << 1) | 0;
			A = A + 1 | 0
		}
		T = g + 0 | 0;
		U = l + 0 | 0;
		S = T + 64 | 0;
		do {
			c[T >> 2] = c[U >> 2];
			T = T + 4 | 0;
			U = U + 4 | 0
		} while ((T | 0) < (S | 0));
		i = o;
		return
	}
	function Cf(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		b = i;
		d = Ef((a | 0) > 0 ? a : 0 - a | 0) | 0;
		c = a << d + -1;
		g = c >> 16;
		a = 536870911 / (g | 0) | 0;
		f = a << 16;
		e = f >> 16;
		c = 536870912 - (($(g, e) | 0) + (($(c & 65535, e) | 0) >> 16)) << 3;
		a = f + (($(c >> 16, e) | 0) + (($(c & 65528, e) | 0) >> 16)) + ($(c, (a >> 15) + 1 >> 1) | 0) | 0;
		d = 62 - d | 0;
		c = d + -47 | 0;
		if ((c | 0) >= 1) {
			i = b;
			return ((c | 0) < 32 ? a >> c : 0) | 0
		}
		c = 47 - d | 0;
		d = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((d | 0) > (e | 0)) {
			if ((a | 0) > (d | 0)) {
				g = d;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (e | 0) ? e : a;
			g = g << c;
			i = b;
			return g | 0
		} else {
			if ((a | 0) > (e | 0)) {
				g = e;
				g = g << c;
				i = b;
				return g | 0
			}
			g = (a | 0) < (d | 0) ? d : a;
			g = g << c;
			i = b;
			return g | 0
		}
		return 0
	}
	function Df(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0;
		c = i;
		e = Ef((a | 0) > 0 ? a : 0 - a | 0) | 0;
		g = a << e + -1;
		d = (Ef((b | 0) > 0 ? b : 0 - b | 0) | 0) + -1 | 0;
		a = b << d;
		b = (536870911 / (a >> 16 | 0) | 0) << 16 >> 16;
		f = ($(g >> 16, b) | 0) + (($(g & 65535, b) | 0) >> 16) | 0;
		a = Gj(a | 0, ((a | 0) < 0) << 31 >> 31 | 0, f | 0, ((f | 0) < 0) << 31 >> 31 | 0) | 0;
		a = uj(a | 0, D | 0, 29) | 0;
		a = g - (a & -8) | 0;
		b = f + (($(a >> 16, b) | 0) + (($(a & 65535, b) | 0) >> 16)) | 0;
		d = e + 28 - d | 0;
		a = d + -16 | 0;
		if ((a | 0) >= 0) {
			i = c;
			return ((a | 0) < 32 ? b >> a : 0) | 0
		}
		a = 16 - d | 0;
		d = -2147483648 >> a;
		e = 2147483647 >>> a;
		if ((d | 0) > (e | 0)) {
			if ((b | 0) > (d | 0)) {
				g = d;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (e | 0) ? e : b;
			g = g << a;
			i = c;
			return g | 0
		} else {
			if ((b | 0) > (e | 0)) {
				g = e;
				g = g << a;
				i = c;
				return g | 0
			}
			g = (b | 0) < (d | 0) ? d : b;
			g = g << a;
			i = c;
			return g | 0
		}
		return 0
	}
	function Ef(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Ff(b, d, e, f, g, h, j) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		n = i;
		i = i + 144 | 0;
		l = n;
		m = b + 2328 | 0;
		k = c[m >> 2] | 0;
		c[l + 136 >> 2] = 0;
		if (!g) {
			o = b + 2388 | 0;
			p = 4
		} else if ((g | 0) == 2 ? (o = b + 2388 | 0, (c[b + (c[o >> 2] << 2) + 2420 >> 2] | 0) == 1) : 0) p = 4;
		else p = 5;
		if ((p | 0) == 4) {
			p = ta() | 0;
			q = i;
			i = i + ((2 * (k + 15 & -16) | 0) + 15 & -16) | 0;
			Gf(b, d, c[o >> 2] | 0, g, h);
			o = b + 2765 | 0;
			Jf(d, q, a[o >> 0] | 0, a[b + 2766 >> 0] | 0, c[m >> 2] | 0);
			Hf(b, l, h);
			Bf(b, l, e, q, j);
			He(b, l, e, 0, j);
			c[b + 4160 >> 2] = 0;
			c[b + 4164 >> 2] = a[o >> 0];
			c[b + 2376 >> 2] = 0;
			ja(p | 0)
		} else if ((p | 0) == 5) He(b, l, e, 1, j);
		p = c[m >> 2] | 0;
		q = (c[b + 2336 >> 2] | 0) - p | 0;
		zj(b + 1348 | 0, b + (p << 1) + 1348 | 0, q << 1 | 0) | 0;
		yj(b + (q << 1) + 1348 | 0, e | 0, c[m >> 2] << 1 | 0) | 0;
		Ld(b, l, e, k);
		Ke(b, e, k);
		c[b + 2308 >> 2] = c[l + ((c[b + 2324 >> 2] | 0) + -1 << 2) >> 2];
		c[f >> 2] = k;
		i = n;
		return 0
	}
	function Gf(f, g, h, j, k) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		l = i;
		i = i + 48 | 0;
		m = l;
		p = l + 32 | 0;
		if ((j | 0) == 0 ? (c[f + (h << 2) + 2404 >> 2] | 0) == 0 : 0) o = sc(g, 24952, 8) | 0;
		else o = (sc(g, 24944, 8) | 0) + 2 | 0;
		h = o >>> 1;
		j = f + 2765 | 0;
		a[j >> 0] = h;
		a[f + 2766 >> 0] = o & 1;
		o = (k | 0) == 2;
		if (o) a[f + 2736 >> 0] = sc(g, 24672, 8) | 0;
		else {
			r = f + 2736 | 0;
			a[r >> 0] = (sc(g, 24648 + (h << 24 >> 24 << 3) | 0, 8) | 0) << 3;
			q = sc(g, 25016, 8) | 0;
			a[r >> 0] = (d[r >> 0] | 0) + q
		}
		h = f + 2324 | 0;
		q = 1;
		while (1) {
			if ((q | 0) >= (c[h >> 2] | 0)) break;
			a[f + q + 2736 >> 0] = sc(g, 24672, 8) | 0;
			q = q + 1 | 0
		}
		q = f + 2732 | 0;
		s = c[q >> 2] | 0;
		r = $(a[j >> 0] >> 1, b[s >> 1] | 0) | 0;
		r = sc(g, (c[s + 12 >> 2] | 0) + r | 0, 8) | 0;
		a[f + 2744 >> 0] = r;
		se(m, p, c[q >> 2] | 0, r << 24 >> 24);
		p = 0;
		while (1) {
			r = c[q >> 2] | 0;
			if ((p | 0) >= (b[r + 2 >> 1] | 0)) break;
			r = sc(g, (c[r + 24 >> 2] | 0) + (b[m + (p << 1) >> 1] | 0) | 0, 8) | 0;
			if (!r) r = 0 - (sc(g, 25024, 8) | 0) | 0;
			else if ((r | 0) == 8) r = (sc(g, 25024, 8) | 0) + 8 | 0;
			s = p + 1 | 0;
			a[f + s + 2744 >> 0] = r + 252;
			p = s
		}
		if ((c[h >> 2] | 0) == 4) a[f + 2767 >> 0] = sc(g, 24960, 8) | 0;
		else a[f + 2767 >> 0] = 4;
		if ((a[j >> 0] | 0) != 2) {
			s = a[j >> 0] | 0;
			s = s << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = s;
			r = sc(g, 24992, 8) | 0;
			r = r & 255;
			s = f + 2770 | 0;
			a[s >> 0] = r;
			i = l;
			return
		}
		if ((o ? (c[f + 2396 >> 2] | 0) == 2 : 0) ? (n = sc(g, 25168, 8) | 0, (n & 65535) << 16 >> 16 > 0) : 0) {
			m = (e[f + 2400 >> 1] | 0) + (n + 65527) & 65535;
			b[f + 2762 >> 1] = m
		} else {
			m = (sc(g, 25136, 8) | 0) << 16 >> 16;
			s = f + 2762 | 0;
			b[s >> 1] = $(m, c[f + 2316 >> 2] >> 1) | 0;
			m = sc(g, c[f + 2380 >> 2] | 0, 8) | 0;
			m = (e[s >> 1] | 0) + m & 65535;
			b[s >> 1] = m
		}
		b[f + 2400 >> 1] = m;
		a[f + 2764 >> 0] = sc(g, c[f + 2384 >> 2] | 0, 8) | 0;
		m = f + 2768 | 0;
		a[m >> 0] = sc(g, 22256, 8) | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (c[h >> 2] | 0)) break;
			a[f + n + 2740 >> 0] = sc(g, c[22320 + (a[m >> 0] << 2) >> 2] | 0, 8) | 0;
			n = n + 1 | 0
		}
		if (!k) {
			a[f + 2769 >> 0] = sc(g, 24936, 8) | 0;
			s = a[j >> 0] | 0;
			s = s << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = s;
			r = sc(g, 24992, 8) | 0;
			r = r & 255;
			s = f + 2770 | 0;
			a[s >> 0] = r;
			i = l;
			return
		} else {
			a[f + 2769 >> 0] = 0;
			s = a[j >> 0] | 0;
			s = s << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = s;
			r = sc(g, 24992, 8) | 0;
			r = r & 255;
			s = f + 2770 | 0;
			a[s >> 0] = r;
			i = l;
			return
		}
	}
	function Hf(d, e, f) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		g = i;
		i = i + 64 | 0;
		j = g + 32 | 0;
		l = g;
		h = d + 2324 | 0;
		hh(e + 16 | 0, d + 2736 | 0, d + 2312 | 0, (f | 0) == 2 & 1, c[h >> 2] | 0);
		de(j, d + 2744 | 0, c[d + 2732 >> 2] | 0);
		f = e + 64 | 0;
		k = d + 2340 | 0;
		Zd(f, j, c[k >> 2] | 0);
		n = d + 2767 | 0;
		if ((c[d + 2376 >> 2] | 0) != 1) {
			o = a[n >> 0] | 0;
			if (o << 24 >> 24 < 4) {
				p = c[k >> 2] | 0;
				n = 0;
				while (1) {
					if ((n | 0) >= (p | 0)) break;
					q = b[d + (n << 1) + 2344 >> 1] | 0;
					b[l + (n << 1) >> 1] = (q & 65535) + (($(o << 24 >> 24, (b[j + (n << 1) >> 1] | 0) - (q << 16 >> 16) | 0) | 0) >>> 2);
					n = n + 1 | 0
				}
				Zd(e + 32 | 0, l, p)
			} else m = 8
		} else {
			a[n >> 0] = 4;
			m = 8
		}
		if ((m | 0) == 8) yj(e + 32 | 0, e + 64 | 0, c[k >> 2] << 1 | 0) | 0;
		l = c[k >> 2] | 0;
		yj(d + 2344 | 0, j | 0, l << 1 | 0) | 0;
		if (c[d + 4160 >> 2] | 0) {
			hf(e + 32 | 0, l, 63570);
			hf(f, c[k >> 2] | 0, 63570)
		}
		if ((a[d + 2765 >> 0] | 0) != 2) {
			wj(e | 0, 0, c[h >> 2] << 2 | 0) | 0;
			wj(e + 96 | 0, 0, (c[h >> 2] | 0) * 10 | 0) | 0;
			a[d + 2768 >> 0] = 0;
			c[e + 136 >> 2] = 0;
			i = g;
			return
		}
		If(b[d + 2762 >> 1] | 0, a[d + 2764 >> 0] | 0, e, c[d + 2316 >> 2] | 0, c[h >> 2] | 0);
		l = c[22688 + (a[d + 2768 >> 0] << 2) >> 2] | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (c[h >> 2] | 0)) break;
			m = (a[d + k + 2740 >> 0] | 0) * 5 | 0;
			f = k * 5 | 0;
			j = 0;
			while (1) {
				if ((j | 0) >= 5) break;
				b[e + (f + j << 1) + 96 >> 1] = a[l + (m + j) >> 0] << 7;
				j = j + 1 | 0
			}
			k = k + 1 | 0
		}
		c[e + 136 >> 2] = b[24976 + (a[d + 2769 >> 0] << 1) >> 1];
		i = g;
		return
	}
	function If(b, d, e, f, g) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		h = i;
		k = (g | 0) == 4;
		if ((f | 0) == 8) {
			j = k ? 11 : 3;
			k = k ? 21304 : 21264
		} else {
			j = k ? 34 : 12;
			k = k ? 21352 : 21272
		}
		l = f << 16;
		f = l >> 15;
		l = (l >> 16) * 18 | 0;
		b = f + (b << 16 >> 16) | 0;
		d = d << 24 >> 24;
		o = (f | 0) > (l | 0);
		n = 0;
		while (1) {
			if ((n | 0) >= (g | 0)) break;
			p = b + (a[k + (($(n, j) | 0) + d) >> 0] | 0) | 0;
			m = e + (n << 2) | 0;
			c[m >> 2] = p;
			if (o) if ((p | 0) > (f | 0)) p = f;
			else p = (p | 0) < (l | 0) ? l : p;
			else if ((p | 0) > (l | 0)) p = l;
			else p = (p | 0) < (f | 0) ? f : p;
			c[m >> 2] = p;
			n = n + 1 | 0
		}
		i = h;
		return
	}
	function Jf(a, d, e, f, g) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		h = i;
		i = i + 160 | 0;
		l = h + 80 | 0;
		j = h;
		o = sc(a, 25624 + ((e >> 1) * 9 | 0) | 0, 8) | 0;
		k = g >> 4;
		k = (k << 4 | 0) < (g | 0) ? k + 1 | 0 : k;
		o = 25272 + (o * 18 | 0) | 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (k | 0)) {
				m = 0;
				break
			}
			r = j + (p << 2) | 0;
			c[r >> 2] = 0;
			q = l + (p << 2) | 0;
			m = 0;
			n = sc(a, o, 8) | 0;
			while (1) {
				c[q >> 2] = n;
				if ((n | 0) != 17) break;
				n = m + 1 | 0;
				c[r >> 2] = n;
				m = n;
				n = sc(a, 25434 + ((n | 0) == 10 & 1) | 0, 8) | 0
			}
			p = p + 1 | 0
		}
		while (1) {
			if ((m | 0) >= (k | 0)) {
				s = 0;
				break
			}
			n = c[l + (m << 2) >> 2] | 0;
			o = d + (m << 16 >> 12 << 1) | 0;
			if ((n | 0) > 0) Jh(o, a, n);
			else {
				n = o + 0 | 0;
				o = n + 32 | 0;
				do {
					b[n >> 1] = 0;
					n = n + 2 | 0
				} while ((n | 0) < (o | 0))
			}
			m = m + 1 | 0
		}
		while (1) {
			if ((s | 0) >= (k | 0)) break;
			r = c[j + (s << 2) >> 2] | 0;
			if ((r | 0) > 0) {
				p = s << 16 >> 12;
				o = 0;
				while (1) {
					if ((o | 0) >= 16) break;
					q = d + (p + o << 1) | 0;
					m = b[q >> 1] | 0;
					n = 0;
					while (1) {
						if ((n | 0) >= (r | 0)) break;
						m = (m << 1) + (sc(a, 24928, 8) | 0) | 0;
						n = n + 1 | 0
					}
					b[q >> 1] = m;
					o = o + 1 | 0
				}
				q = l + (s << 2) | 0;
				c[q >> 2] = c[q >> 2] | r << 5
			}
			s = s + 1 | 0
		}
		mf(a, d, g, e, f, l);
		i = h;
		return
	}
	function Kf(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		j = i;
		f = d << 16 >> 16;
		c[b + 2332 >> 2] = f * 5;
		l = b + 2324 | 0;
		h = $(c[l >> 2] << 16 >> 16, f * 327680 >> 16) | 0;
		g = b + 2316 | 0;
		n = b + 2320 | 0;
		if ((c[g >> 2] | 0) == (d | 0) ? (c[n >> 2] | 0) == (e | 0) : 0) {
			e = 1;
			m = 0;
			k = 4
		} else k = 3;
		if ((k | 0) == 3) {
			m = vh(b + 2432 | 0, f * 1e3 | 0, e, 0) | 0;
			c[n >> 2] = e;
			e = (c[g >> 2] | 0) == (d | 0);
			if (e) k = 4
		}
		if ((k | 0) == 4) if ((h | 0) == (c[b + 2328 >> 2] | 0)) {
			o = m;
			i = j;
			return o | 0
		}
		n = (d | 0) == 8;
		l = (c[l >> 2] | 0) == 4;
		o = b + 2384 | 0;
		do
		if (n) if (l) {
			c[o >> 2] = 25232;
			break
		} else {
			c[o >> 2] = 25264;
			break
		} else if (l) {
			c[o >> 2] = 25192;
			break
		} else {
			c[o >> 2] = 25248;
			break
		}
		while (0);
		if (!e) {
			c[b + 2336 >> 2] = f * 20;
			if ((d | 0) == 8 | (d | 0) == 12) {
				c[b + 2340 >> 2] = 10;
				c[b + 2732 >> 2] = 23520;
				if ((d | 0) == 12) c[b + 2380 >> 2] = 25008;
				else k = 18
			} else {
				c[b + 2340 >> 2] = 16;
				c[b + 2732 >> 2] = 24608;
				if ((d | 0) == 16) c[b + 2380 >> 2] = 25016;
				else k = 18
			}
			if ((k | 0) == 18 ? n : 0) c[b + 2380 >> 2] = 24992;
			c[b + 2376 >> 2] = 1;
			c[b + 2308 >> 2] = 100;
			a[b + 2312 >> 0] = 10;
			c[b + 4164 >> 2] = 0;
			wj(b + 1284 | 0, 0, 1024) | 0
		}
		c[g >> 2] = d;
		c[b + 2328 >> 2] = h;
		o = m;
		i = j;
		return o | 0
	}
	function Lf(a) {
		a = a | 0;
		c[a >> 2] = 24564;
		return 0
	}
	function Mf(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		f = i;
		wj(a | 0, 0, 24564) | 0;
		e = 0;
		g = 0;
		while (1) {
			if ((g | 0) >= 2) break;
			e = e + (lh(a + (g * 12240 | 0) | 0, b) | 0) | 0;
			g = g + 1 | 0
		}
		c[a + 24540 >> 2] = 1;
		c[a + 24544 >> 2] = 1;
		b = e + (Nf(a, d) | 0) | 0;
		i = f;
		return b | 0
	}
	function Nf(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0;
		d = i;
		c[b >> 2] = c[a + 24540 >> 2];
		c[b + 4 >> 2] = c[a + 24544 >> 2];
		c[b + 8 >> 2] = c[a + 4580 >> 2];
		c[b + 12 >> 2] = c[a + 4588 >> 2];
		c[b + 16 >> 2] = c[a + 4592 >> 2];
		c[b + 20 >> 2] = c[a + 4596 >> 2];
		c[b + 24 >> 2] = c[a + 4636 >> 2];
		c[b + 28 >> 2] = c[a + 4632 >> 2];
		c[b + 32 >> 2] = c[a + 4640 >> 2];
		c[b + 36 >> 2] = c[a + 4648 >> 2];
		c[b + 40 >> 2] = c[a + 6120 >> 2];
		c[b + 44 >> 2] = c[a + 6108 >> 2];
		c[b + 48 >> 2] = c[a + 4708 >> 2];
		e = a + 4600 | 0;
		c[b + 68 >> 2] = (c[e >> 2] << 16 >> 16) * 1e3;
		c[b + 72 >> 2] = c[a + 4560 >> 2];
		if ((c[e >> 2] | 0) != 16) {
			a = 0;
			a = a & 1;
			e = b + 76 | 0;
			c[e >> 2] = a;
			i = d;
			return 0
		}
		a = (c[a + 28 >> 2] | 0) == 0;
		a = a & 1;
		e = b + 76 | 0;
		c[e >> 2] = a;
		i = d;
		return 0
	}
	function Of(d, f, g, h, j, k, l) {
		d = d | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ua = 0,
			va = 0,
			wa = 0,
			xa = 0,
			ya = 0,
			za = 0,
			Aa = 0,
			Ba = 0,
			Ca = 0,
			Da = 0,
			Ea = 0,
			Fa = 0;
		m = i;
		i = i + 16 | 0;
		s = m;
		t = m + 8 | 0;
		if (c[f + 64 >> 2] | 0) {
			c[d + 4696 >> 2] = 1;
			c[d + 16936 >> 2] = 1
		}
		c[d + 18020 >> 2] = 0;
		r = d + 5780 | 0;
		c[r >> 2] = 0;
		n = kf(f) | 0;
		if (n) {
			Fa = n;
			i = m;
			return Fa | 0
		}
		c[f + 84 >> 2] = 0;
		n = f + 4 | 0;
		u = d + 24544 | 0;
		if ((c[n >> 2] | 0) > (c[u >> 2] | 0)) {
			va = lh(d + 12240 | 0, c[d + 5124 >> 2] | 0) | 0;
			Fa = d + 24480 | 0;
			b[Fa >> 1] = 0;
			b[Fa + 2 >> 1] = 0 >>> 16;
			Fa = d + 24488 | 0;
			b[Fa >> 1] = 0;
			b[Fa + 2 >> 1] = 0 >>> 16;
			c[d + 24492 >> 2] = 0;
			c[d + 24496 >> 2] = 1;
			c[d + 24500 >> 2] = 0;
			c[d + 24504 >> 2] = 1;
			b[d + 24510 >> 1] = 0;
			b[d + 24508 >> 1] = 16384;
			if ((c[d + 24540 >> 2] | 0) == 2) {
				yj(d + 18048 | 0, d + 5808 | 0, 300) | 0;
				Da = d;
				Ea = c[Da + 4 >> 2] | 0;
				Fa = d + 12240 | 0;
				c[Fa >> 2] = c[Da >> 2];
				c[Fa + 4 >> 2] = Ea
			}
		} else va = 0;
		p = f + 24 | 0;
		if ((c[p >> 2] | 0) == (c[d + 4636 >> 2] | 0)) B = (c[u >> 2] | 0) != (c[n >> 2] | 0);
		else B = 1;
		c[d + 24540 >> 2] = c[f >> 2];
		c[u >> 2] = c[n >> 2];
		w = h * 100 | 0;
		v = c[f + 8 >> 2] | 0;
		C = (w | 0) / (v | 0) | 0;
		u = (C | 0) > 1 ? C >> 1 : 1;
		l = (l | 0) == 0;
		a: do
		if (l) {
			if (($(C, v) | 0) != (w | 0) | (h | 0) < 0) {
				Fa = -101;
				i = m;
				return Fa | 0
			}
			if ((h * 1e3 | 0) > ($(c[p >> 2] | 0, v) | 0)) {
				Fa = -101;
				i = m;
				return Fa | 0
			} else {
				E = c[n >> 2] | 0;
				v = 0;
				w = 0;
				break
			}
		} else {
			if ((C | 0) == 1) v = 0;
			else {
				Fa = -101;
				i = m;
				return Fa | 0
			}
			while (1) {
				E = c[n >> 2] | 0;
				if ((v | 0) >= (E | 0)) break;
				va = lh(d + (v * 12240 | 0) | 0, c[d + (v * 12240 | 0) + 5124 >> 2] | 0) | 0;
				v = v + 1 | 0
			}
			w = c[p >> 2] | 0;
			c[p >> 2] = 10;
			x = f + 36 | 0;
			v = c[x >> 2] | 0;
			c[x >> 2] = 0;
			x = 0;
			while (1) {
				if ((x | 0) >= (E | 0)) break a;
				c[d + (x * 12240 | 0) + 4700 >> 2] = 0;
				c[d + (x * 12240 | 0) + 4712 >> 2] = 1;
				E = c[n >> 2] | 0;
				x = x + 1 | 0
			}
		}
		while (0);
		y = f + 28 | 0;
		D = c[y >> 2] >> E + -1;
		x = d + 4600 | 0;
		A = d + 24556 | 0;
		z = d + 5776 | 0;
		F = E;
		E = 0;
		while (1) {
			if ((E | 0) >= (F | 0)) break;
			if ((E | 0) == 1) F = c[x >> 2] | 0;
			else F = 0;
			F = pf(d + (E * 12240 | 0) | 0, f, D, c[A >> 2] | 0, E, F) | 0;
			if (F) {
				o = 146;
				break
			}
			b: do
			if ((c[d + (E * 12240 | 0) + 4696 >> 2] | 0) == 0 ^ 1 | B) {
				F = 0;
				while (1) {
					if ((F | 0) >= (c[z >> 2] | 0)) break b;
					c[d + (E * 12240 | 0) + (F << 2) + 4756 >> 2] = 0;
					F = F + 1 | 0
				}
			}
			while (0);
			c[d + (E * 12240 | 0) + 6112 >> 2] = c[d + (E * 12240 | 0) + 6108 >> 2];
			F = c[n >> 2] | 0;
			va = 0;
			E = E + 1 | 0
		}
		if ((o | 0) == 146) {
			i = m;
			return F | 0
		}
		ea = C * 10 | 0;
		O = c[x >> 2] | 0;
		E = $(ea, O) | 0;
		ca = d + 4580 | 0;
		O = ($(E, c[ca >> 2] | 0) | 0) / (O * 1e3 | 0) | 0;
		B = ta() | 0;
		da = i;
		i = i + ((2 * O | 0) + 15 & -16) | 0;
		O = d + 4608 | 0;
		J = d + 5772 | 0;
		D = d + 24548 | 0;
		G = d + 18048 | 0;
		I = d + 5808 | 0;
		H = d + 16848 | 0;
		P = d + 18012 | 0;
		K = d + 16840 | 0;
		L = j + 20 | 0;
		F = j + 28 | 0;
		ga = d + 24536 | 0;
		S = d + 24480 | 0;
		R = d + 5132 | 0;
		Q = d + 17372 | 0;
		ka = d + 4556 | 0;
		C = f + 56 | 0;
		na = d + 24560 | 0;
		Y = d + 19440 | 0;
		Z = d + 12384 | 0;
		_ = d + 12256 | 0;
		X = d + 16808 | 0;
		W = d + 16740 | 0;
		V = d + 16805 | 0;
		U = d + 16756 | 0;
		T = d + 16936 | 0;
		aa = d + 12240 | 0;
		qa = f + 52 | 0;
		ma = (u | 0) == 2;
		pa = f + 48 | 0;
		fa = s + 4 | 0;
		oa = u << 1;
		ba = u + -1 | 0;
		la = d + 6112 | 0;
		ia = d + 24552 | 0;
		ha = d + 18352 | 0;
		M = d + 5128 | 0;
		N = d + 24484 | 0;
		ra = 0;
		while (1) {
			wa = c[J >> 2] | 0;
			ua = (c[O >> 2] | 0) - wa | 0;
			ua = (ua | 0) < (E | 0) ? ua : E;
			sa = $(ua, c[ca >> 2] | 0) | 0;
			sa = (sa | 0) / ((c[x >> 2] | 0) * 1e3 | 0) | 0;
			do
			if ((c[f >> 2] | 0) == 2) if ((c[n >> 2] | 0) == 2) {
				ya = c[r >> 2] | 0;
				xa = 0;
				while (1) {
					if ((xa | 0) >= (sa | 0)) break;
					b[da + (xa << 1) >> 1] = b[g + (xa << 1 << 1) >> 1] | 0;
					xa = xa + 1 | 0
				}
				if ((c[D >> 2] | 0) == 1 & (ya | 0) == 0) yj(G | 0, I | 0, 300) | 0;
				wh(I, d + (wa + 2 << 1) + 5128 | 0, da, sa);
				c[J >> 2] = (c[J >> 2] | 0) + ua;
				xa = c[P >> 2] | 0;
				wa = (c[H >> 2] | 0) - xa | 0;
				ua = $(ea, c[K >> 2] | 0) | 0;
				ua = (wa | 0) < (ua | 0) ? wa : ua;
				wa = 0;
				while (1) {
					if ((wa | 0) >= (sa | 0)) break;
					b[da + (wa << 1) >> 1] = b[g + ((wa << 1 | 1) << 1) >> 1] | 0;
					wa = wa + 1 | 0
				}
				wh(G, d + (xa + 2 << 1) + 17368 | 0, da, sa);
				c[P >> 2] = (c[P >> 2] | 0) + ua;
				wa = c[J >> 2] | 0;
				break
			} else {
				if ((c[n >> 2] | 0) == 1) xa = 0;
				else {
					o = 49;
					break
				}
				while (1) {
					if ((xa | 0) >= (sa | 0)) break;
					Fa = xa << 1;
					Fa = (b[g + (Fa << 1) >> 1] | 0) + (b[g + ((Fa | 1) << 1) >> 1] | 0) | 0;
					b[da + (xa << 1) >> 1] = (Fa >>> 1) + (Fa & 1);
					xa = xa + 1 | 0
				}
				wh(I, d + (wa + 2 << 1) + 5128 | 0, da, sa);
				c: do
				if ((c[D >> 2] | 0) == 2 ? (c[r >> 2] | 0) == 0 : 0) {
					wh(G, d + ((c[P >> 2] | 0) + 2 << 1) + 17368 | 0, da, sa);
					wa = 0;
					while (1) {
						if ((wa | 0) >= (c[O >> 2] | 0)) break c;
						Fa = d + ((c[J >> 2] | 0) + wa + 2 << 1) + 5128 | 0;
						b[Fa >> 1] = ((b[Fa >> 1] | 0) + (b[d + ((c[P >> 2] | 0) + wa + 2 << 1) + 17368 >> 1] | 0) | 0) >>> 1;
						wa = wa + 1 | 0
					}
				}
				while (0);
				wa = (c[J >> 2] | 0) + ua | 0;
				c[J >> 2] = wa;
				break
			} else o = 49;
			while (0);
			if ((o | 0) == 49) {
				o = 0;
				yj(da | 0, g | 0, sa << 1 | 0) | 0;
				wh(I, d + (wa + 2 << 1) + 5128 | 0, da, sa);
				wa = (c[J >> 2] | 0) + ua | 0;
				c[J >> 2] = wa
			}
			g = g + (($(sa, c[f >> 2] | 0) | 0) << 1) | 0;
			ua = h - sa | 0;
			c[A >> 2] = 0;
			if ((wa | 0) < (c[O >> 2] | 0)) {
				q = 0;
				break
			}
			d: do
			if (!((c[r >> 2] | 0) == 0 ^ 1 | l ^ 1)) {
				b[t >> 1] = 0;
				a[t >> 0] = 256 - (256 >>> ($((c[z >> 2] | 0) + 1 | 0, c[n >> 2] | 0) | 0));
				Cc(j, 0, t, 8);
				wa = 0;
				while (1) {
					Ca = c[n >> 2] | 0;
					if ((wa | 0) >= (Ca | 0)) {
						wa = 0;
						break
					}
					za = c[d + (wa * 12240 | 0) + 5776 >> 2] | 0;
					ya = 0;
					xa = 0;
					while (1) {
						if ((xa | 0) >= (za | 0)) break;
						ya = ya | c[d + (wa * 12240 | 0) + (xa << 2) + 4756 >> 2] << xa;
						xa = xa + 1 | 0
					}
					a[d + (wa * 12240 | 0) + 4755 >> 0] = (ya | 0) > 0 & 1;
					if ((ya | 0) != 0 & (za | 0) > 1) Cc(j, ya + -1 | 0, c[24920 + (za + -2 << 2) >> 2] | 0, 8);
					wa = wa + 1 | 0
				}
				while (1) {
					if ((wa | 0) >= (c[z >> 2] | 0)) {
						wa = 0;
						break
					}
					xa = d + (wa * 6 | 0) + 24514 | 0;
					Aa = d + (wa << 2) + 16996 | 0;
					za = d + wa + 24532 | 0;
					ya = wa + -1 | 0;
					Ba = 0;
					while (1) {
						if ((Ba | 0) >= (Ca | 0)) break;
						if (c[d + (Ba * 12240 | 0) + (wa << 2) + 4756 >> 2] | 0) {
							if ((Ca | 0) == 2 & (Ba | 0) == 0 ? (Vh(j, xa), (c[Aa >> 2] | 0) == 0) : 0) Wh(j, a[za >> 0] | 0);
							if ((wa | 0) > 0 ? (c[d + (Ba * 12240 | 0) + (ya << 2) + 4756 >> 2] | 0) != 0 : 0) Ca = 2;
							else Ca = 0;
							Qf(d + (Ba * 12240 | 0) | 0, j, wa, 1, Ca);
							Rf(j, a[d + (Ba * 12240 | 0) + (wa * 36 | 0) + 6161 >> 0] | 0, a[d + (Ba * 12240 | 0) + (wa * 36 | 0) + 6162 >> 0] | 0, d + (Ba * 12240 | 0) + (wa * 320 | 0) + 6240 | 0, c[d + (Ba * 12240 | 0) + 4608 >> 2] | 0);
							Ca = c[n >> 2] | 0
						}
						Ba = Ba + 1 | 0
					}
					wa = wa + 1 | 0
				}
				while (1) {
					if ((wa | 0) >= (Ca | 0)) break d;
					Ca = d + (wa * 12240 | 0) + 4756 | 0;
					c[Ca + 0 >> 2] = 0;
					c[Ca + 4 >> 2] = 0;
					c[Ca + 8 >> 2] = 0;
					Ca = c[n >> 2] | 0;
					wa = wa + 1 | 0
				}
			}
			while (0);
			Rd(d);
			wa = c[y >> 2] | 0;
			ya = c[p >> 2] | 0;
			za = ($(wa, ya) | 0) / 1e3 | 0;
			if (l) za = za - ((Pf(c[L >> 2] | 0, c[F >> 2] | 0) | 0) >> 1) | 0;
			xa = c[r >> 2] | 0;
			za = ((za | 0) / ((c[z >> 2] | 0) - xa | 0) | 0) << 16 >> 16;
			if ((ya | 0) == 10) ya = za * 100 | 0;
			else ya = za * 50 | 0;
			ya = ya - (((c[ga >> 2] | 0) * 1e3 | 0) / 500 | 0) | 0;
			if ((wa | 0) > 5e3) {
				if ((ya | 0) <= (wa | 0)) wa = (ya | 0) < 5e3 ? 5e3 : ya
			} else if ((ya | 0) > 5e3) wa = 5e3;
			else wa = (ya | 0) < (wa | 0) ? wa : ya;
			if ((c[n >> 2] | 0) == 2) {
				Oh(S, R, Q, d + (xa * 6 | 0) + 24514 | 0, d + xa + 24532 | 0, s, wa, c[ka >> 2] | 0, c[C >> 2] | 0, c[x >> 2] | 0, c[O >> 2] | 0);
				xa = c[r >> 2] | 0;
				if (!(a[d + xa + 24532 >> 0] | 0)) {
					if ((c[na >> 2] | 0) == 1) {
						Fa = _;
						c[Fa >> 2] = 0;
						c[Fa + 4 >> 2] = 0;
						wj(Z | 0, 0, 4412) | 0;
						wj(Y | 0, 0, 2156) | 0;
						c[X >> 2] = 100;
						c[W >> 2] = 100;
						a[Y >> 0] = 10;
						a[V >> 0] = 0;
						c[U >> 2] = 65536;
						c[T >> 2] = 1
					}
					gg(aa)
				} else a[d + xa + 16992 >> 0] = 0;
				if (l ? (Vh(j, d + ((c[r >> 2] | 0) * 6 | 0) + 24514 | 0), q = c[r >> 2] | 0, (a[d + q + 16992 >> 0] | 0) == 0) : 0) Wh(j, a[d + q + 24532 >> 0] | 0)
			} else {
				Fa = e[N >> 1] | e[N + 2 >> 1] << 16;
				b[M >> 1] = Fa;
				b[M + 2 >> 1] = Fa >>> 16;
				Fa = d + (c[O >> 2] << 1) + 5128 | 0;
				Fa = e[Fa >> 1] | e[Fa + 2 >> 1] << 16;
				b[N >> 1] = Fa;
				b[N + 2 >> 1] = Fa >>> 16
			}
			gg(d);
			za = (ra | 0) == 0;
			ya = (c[fa >> 2] | 0) > 0;
			xa = (ra | 0) == (ba | 0);
			Aa = (ra | 0) == 1;
			Ba = 0;
			while (1) {
				Ea = c[n >> 2] | 0;
				if ((Ba | 0) >= (Ea | 0)) break;
				Da = c[qa >> 2] | 0;
				do
				if (ma) if (za) Fa = (Da * 3 | 0) / 5 | 0;
				else Fa = Da;
				else if ((u | 0) == 3) {
					if (za) {
						Fa = (Da << 1 | 0) / 5 | 0;
						break
					}
					if (Aa) Fa = (Da * 3 | 0) / 4 | 0;
					else Fa = Da
				} else Fa = Da;
				while (0);
				Ca = ((c[pa >> 2] | 0) == 0 ? 0 : xa) & 1;
				if ((Ea | 0) != 1) {
					Ea = c[s + (Ba << 2) >> 2] | 0;
					if (!((Ba | 0) == 0 ^ 1 | ya ^ 1)) {
						Fa = Fa - ((Da | 0) / (oa | 0) | 0) | 0;
						Ca = 0
					}
				} else Ea = wa;
				if ((Ea | 0) > 0) {
					nf(d + (Ba * 12240 | 0) | 0, Ea);
					do
					if (((c[r >> 2] | 0) - Ba | 0) < 1) va = 0;
					else {
						if ((Ba | 0) > 0 ? (c[na >> 2] | 0) != 0 : 0) {
							va = 1;
							break
						}
						va = 2
					}
					while (0);
					va = hg(d + (Ba * 12240 | 0) | 0, k, j, va, Fa, Ca) | 0
				}
				c[d + (Ba * 12240 | 0) + 4700 >> 2] = 0;
				c[d + (Ba * 12240 | 0) + 5772 >> 2] = 0;
				Fa = d + (Ba * 12240 | 0) + 5780 | 0;
				c[Fa >> 2] = (c[Fa >> 2] | 0) + 1;
				Ba = Ba + 1 | 0
			}
			xa = c[r >> 2] | 0;
			c[na >> 2] = a[d + (xa + -1) + 24532 >> 0];
			do
			if ((c[k >> 2] | 0) > 0 ? (xa | 0) == (c[z >> 2] | 0) : 0) {
				wa = c[n >> 2] | 0;
				Ba = 0;
				ya = 0;
				while (1) {
					if ((ya | 0) >= (wa | 0)) break;
					za = c[d + (ya * 12240 | 0) + 5776 >> 2] | 0;
					Aa = 0;
					while (1) {
						Ba = Ba << 1;
						if ((Aa | 0) >= (za | 0)) break;
						Ba = Ba | a[d + (ya * 12240 | 0) + Aa + 4752 >> 0];
						Aa = Aa + 1 | 0
					}
					Ba = Ba | a[d + (ya * 12240 | 0) + 4755 >> 0];
					ya = ya + 1 | 0
				}
				if (l) Gc(j, Ba, $(xa + 1 | 0, wa) | 0);
				do
				if (c[la >> 2] | 0) {
					if ((c[n >> 2] | 0) != 1 ? (c[ha >> 2] | 0) == 0 : 0) break;
					c[k >> 2] = 0
				}
				while (0);
				wa = (c[ga >> 2] | 0) + (c[k >> 2] << 3) | 0;
				c[ga >> 2] = wa;
				wa = wa - (($(c[y >> 2] | 0, c[p >> 2] | 0) | 0) / 1e3 | 0) | 0;
				c[ga >> 2] = wa;
				if ((wa | 0) > 1e4) wa = 1e4;
				else wa = (wa | 0) < 0 ? 0 : wa;
				c[ga >> 2] = wa;
				wa = c[ia >> 2] | 0;
				if ((c[ka >> 2] | 0) < (((wa << 16 >> 16) * 3188 >> 16) + 13 | 0)) {
					c[A >> 2] = 1;
					c[ia >> 2] = 0;
					break
				} else {
					c[A >> 2] = 0;
					c[ia >> 2] = wa + (c[p >> 2] | 0);
					break
				}
			}
			while (0);
			if ((h | 0) == (sa | 0)) {
				o = 135;
				break
			}
			h = ua;
			ra = ra + 1 | 0
		}
		if ((o | 0) == 135) q = c[A >> 2] | 0;
		c[D >> 2] = c[n >> 2];
		c[f + 72 >> 2] = q;
		if ((c[x >> 2] | 0) == 16) o = (c[d + 28 >> 2] | 0) == 0;
		else o = 0;
		c[f + 76 >> 2] = o & 1;
		c[f + 68 >> 2] = (c[x >> 2] << 16 >> 16) * 1e3;
		if (!(c[C >> 2] | 0)) o = b[d + 24508 >> 1] | 0;
		else o = 0;
		c[f + 80 >> 2] = o;
		e: do
		if (!l) {
			c[p >> 2] = w;
			c[f + 36 >> 2] = v;
			f = 0;
			while (1) {
				if ((f | 0) >= (c[n >> 2] | 0)) break e;
				c[d + (f * 12240 | 0) + 4700 >> 2] = 0;
				c[d + (f * 12240 | 0) + 4712 >> 2] = 0;
				f = f + 1 | 0
			}
		}
		while (0);
		ja(B | 0);
		Fa = va;
		i = m;
		return Fa | 0
	}
	function Pf(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function Qf(e, f, g, h, j) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		k = i;
		i = i + 48 | 0;
		m = k;
		p = k + 32 | 0;
		n = (h | 0) == 0;
		if (n) h = e + 4768 | 0;
		else h = e + (g * 36 | 0) + 6132 | 0;
		g = h + 29 | 0;
		o = (a[g >> 0] << 1) + (a[h + 30 >> 0] | 0) | 0;
		if (n ^ 1 | (o | 0) > 1) Cc(f, o + -2 | 0, 24944, 8);
		else Cc(f, o, 24952, 8);
		o = (j | 0) == 2;
		n = a[h >> 0] | 0;
		if (o) Cc(f, n, 24672, 8);
		else {
			Cc(f, n >> 3, 24648 + (a[g >> 0] << 3) | 0, 8);
			Cc(f, d[h >> 0] & 7, 25016, 8)
		}
		n = e + 4604 | 0;
		q = 1;
		while (1) {
			if ((q | 0) >= (c[n >> 2] | 0)) break;
			Cc(f, a[h + q >> 0] | 0, 24672, 8);
			q = q + 1 | 0
		}
		s = h + 8 | 0;
		q = e + 4724 | 0;
		t = c[q >> 2] | 0;
		u = $(a[g >> 0] >> 1, b[t >> 1] | 0) | 0;
		Cc(f, a[s >> 0] | 0, (c[t + 12 >> 2] | 0) + u | 0, 8);
		se(m, p, c[q >> 2] | 0, a[s >> 0] | 0);
		s = 0;
		while (1) {
			t = c[q >> 2] | 0;
			if ((s | 0) >= (b[t + 2 >> 1] | 0)) break;
			r = s + 1 | 0;
			p = h + r + 8 | 0;
			u = a[p >> 0] | 0;
			if (u << 24 >> 24 > 3) {
				Cc(f, 8, (c[t + 24 >> 2] | 0) + (b[m + (s << 1) >> 1] | 0) | 0, 8);
				Cc(f, (a[p >> 0] | 0) + -4 | 0, 25024, 8);
				s = r;
				continue
			}
			if (u << 24 >> 24 < -3) {
				Cc(f, 0, (c[t + 24 >> 2] | 0) + (b[m + (s << 1) >> 1] | 0) | 0, 8);
				Cc(f, -4 - (a[p >> 0] | 0) | 0, 25024, 8);
				s = r;
				continue
			} else {
				Cc(f, (u << 24 >> 24) + 4 | 0, (c[t + 24 >> 2] | 0) + (b[m + (s << 1) >> 1] | 0) | 0, 8);
				s = r;
				continue
			}
		}
		if ((c[n >> 2] | 0) == 4) Cc(f, a[h + 31 >> 0] | 0, 24960, 8);
		if ((a[g >> 0] | 0) != 2) {
			t = a[g >> 0] | 0;
			t = t << 24 >> 24;
			u = e + 5800 | 0;
			c[u >> 2] = t;
			u = h + 34 | 0;
			u = a[u >> 0] | 0;
			u = u << 24 >> 24;
			Cc(f, u, 24992, 8);
			i = k;
			return
		}
		do
		if (o ? (c[e + 5800 >> 2] | 0) == 2 : 0) {
			m = (b[h + 26 >> 1] | 0) - (b[e + 5804 >> 1] | 0) | 0;
			if ((m | 0) < -8 | (m | 0) > 11) {
				Cc(f, 0, 25168, 8);
				l = 28;
				break
			} else {
				Cc(f, m + 9 | 0, 25168, 8);
				m = h + 26 | 0;
				break
			}
		} else l = 28;
		while (0);
		if ((l | 0) == 28) {
			m = h + 26 | 0;
			s = b[m >> 1] | 0;
			u = c[e + 4600 >> 2] | 0;
			t = (s | 0) / (u >> 1 | 0) | 0;
			u = s - ($(t << 16 >> 16, u << 15 >> 16) | 0) | 0;
			Cc(f, t, 25136, 8);
			Cc(f, u, c[e + 4716 >> 2] | 0, 8)
		}
		b[e + 5804 >> 1] = b[m >> 1] | 0;
		Cc(f, a[h + 28 >> 0] | 0, c[e + 4720 >> 2] | 0, 8);
		l = h + 32 | 0;
		Cc(f, a[l >> 0] | 0, 22256, 8);
		m = 0;
		while (1) {
			if ((m | 0) >= (c[n >> 2] | 0)) break;
			Cc(f, a[h + m + 4 >> 0] | 0, c[22320 + (a[l >> 0] << 2) >> 2] | 0, 8);
			m = m + 1 | 0
		}
		if (j) {
			t = a[g >> 0] | 0;
			t = t << 24 >> 24;
			u = e + 5800 | 0;
			c[u >> 2] = t;
			u = h + 34 | 0;
			u = a[u >> 0] | 0;
			u = u << 24 >> 24;
			Cc(f, u, 24992, 8);
			i = k;
			return
		}
		Cc(f, a[h + 33 >> 0] | 0, 24936, 8);
		t = a[g >> 0] | 0;
		t = t << 24 >> 24;
		u = e + 5800 | 0;
		c[u >> 2] = t;
		u = h + 34 | 0;
		u = a[u >> 0] | 0;
		u = u << 24 >> 24;
		Cc(f, u, 24992, 8);
		i = k;
		return
	}
	function Rf(b, e, f, g, h) {
		b = b | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0;
		j = i;
		i = i + 32 | 0;
		o = j;
		c[o + 0 >> 2] = 0;
		c[o + 4 >> 2] = 0;
		c[o + 8 >> 2] = 0;
		c[o + 12 >> 2] = 0;
		c[o + 16 >> 2] = 0;
		c[o + 20 >> 2] = 0;
		c[o + 24 >> 2] = 0;
		c[o + 28 >> 2] = 0;
		k = h >> 4;
		if ((k << 4 | 0) < (h | 0)) {
			k = k + 1 | 0;
			m = g + h + 0 | 0;
			l = m + 16 | 0;
			do {
				a[m >> 0] = 0;
				m = m + 1 | 0
			} while ((m | 0) < (l | 0))
		}
		l = k << 4;
		n = i;
		i = i + ((4 * l | 0) + 15 & -16) | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (l | 0)) break;
			t = a[g + m >> 0] | 0;
			v = t << 24 >> 24;
			c[n + (m << 2) >> 2] = t << 24 >> 24 > 0 ? v : 0 - v | 0;
			v = m | 1;
			t = a[g + v >> 0] | 0;
			u = t << 24 >> 24;
			c[n + (v << 2) >> 2] = t << 24 >> 24 > 0 ? u : 0 - u | 0;
			v = m | 2;
			u = a[g + v >> 0] | 0;
			t = u << 24 >> 24;
			c[n + (v << 2) >> 2] = u << 24 >> 24 > 0 ? t : 0 - t | 0;
			v = m | 3;
			t = a[g + v >> 0] | 0;
			u = t << 24 >> 24;
			c[n + (v << 2) >> 2] = t << 24 >> 24 > 0 ? u : 0 - u | 0;
			m = m + 4 | 0
		}
		l = i;
		i = i + ((4 * k | 0) + 15 & -16) | 0;
		m = i;
		i = i + ((4 * k | 0) + 15 & -16) | 0;
		t = n;
		p = 0;
		while (1) {
			if ((p | 0) >= (k | 0)) break;
			q = m + (p << 2) | 0;
			c[q >> 2] = 0;
			r = l + (p << 2) | 0;
			a: while (1) {
				v = Sf(o, t, 8, 8) | 0;
				v = v + (Sf(o, o, 10, 4) | 0) | 0;
				v = v + (Sf(o, o, 12, 2) | 0) | 0;
				if ((v | 0) == (0 - (Sf(r, o, 16, 1) | 0) | 0)) break;
				c[q >> 2] = (c[q >> 2] | 0) + 1;
				s = 0;
				while (1) {
					if ((s | 0) >= 16) continue a;
					v = t + (s << 2) | 0;
					c[v >> 2] = c[v >> 2] >> 1;
					s = s + 1 | 0
				}
			}
			t = t + 64 | 0;
			p = p + 1 | 0
		}
		u = e >> 1;
		v = 0;
		o = 2147483647;
		q = 0;
		while (1) {
			if ((q | 0) >= 9) break;
			s = 25473 + (q * 18 | 0) | 0;
			r = 0;
			t = d[25648 + (u * 9 | 0) + q >> 0] | 0;
			while (1) {
				if ((r | 0) >= (k | 0)) break;
				if ((c[m + (r << 2) >> 2] | 0) > 0) p = a[s >> 0] | 0;
				else p = a[(c[l + (r << 2) >> 2] | 0) + (25456 + (q * 18 | 0)) >> 0] | 0;
				r = r + 1 | 0;
				t = t + (p & 255) | 0
			}
			s = (t | 0) < (o | 0);
			v = s ? q : v;
			o = s ? t : o;
			q = q + 1 | 0
		}
		Cc(b, v, 25624 + (u * 9 | 0) | 0, 8);
		o = 25272 + (v * 18 | 0) | 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (k | 0)) {
				o = 0;
				break
			}
			q = c[m + (p << 2) >> 2] | 0;
			if (!q) Cc(b, c[l + (p << 2) >> 2] | 0, o, 8);
			else {
				Cc(b, 17, o, 8);
				q = q + -1 | 0;
				r = 0;
				while (1) {
					if ((r | 0) >= (q | 0)) break;
					Cc(b, 17, 25434 | 0, 8);
					r = r + 1 | 0
				}
				Cc(b, c[l + (p << 2) >> 2] | 0, 25434 | 0, 8)
			}
			p = p + 1 | 0
		}
		while (1) {
			if ((o | 0) >= (k | 0)) {
				r = 0;
				break
			}
			if ((c[l + (o << 2) >> 2] | 0) > 0) Gh(b, n + (o << 4 << 2) | 0);
			o = o + 1 | 0
		}
		while (1) {
			if ((r | 0) >= (k | 0)) break;
			q = c[m + (r << 2) >> 2] | 0;
			b: do
			if ((q | 0) > 0) {
				p = r << 4;
				o = 0;
				while (1) {
					if ((o | 0) >= 16) break b;
					s = a[g + (p + o) >> 0] | 0;
					n = s << 24 >> 24;
					n = (s << 24 >> 24 > 0 ? n : 0 - n | 0) << 24 >> 24;
					s = q;
					while (1) {
						s = s + -1 | 0;
						if ((s | 0) <= 0) break;
						Cc(b, n >>> s & 1, 24928, 8)
					}
					Cc(b, n & 1, 24928, 8);
					o = o + 1 | 0
				}
			}
			while (0);
			r = r + 1 | 0
		}
		lf(b, g, h, e, f, l);
		i = j;
		return
	}
	function Sf(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		f = i;
		g = 0;
		while (1) {
			if ((g | 0) >= (e | 0)) {
				g = 0;
				b = 5;
				break
			}
			h = g << 1;
			h = (c[b + (h << 2) >> 2] | 0) + (c[b + ((h | 1) << 2) >> 2] | 0) | 0;
			if ((h | 0) > (d | 0)) {
				g = 1;
				b = 5;
				break
			}
			c[a + (g << 2) >> 2] = h;
			g = g + 1 | 0
		}
		if ((b | 0) == 5) {
			i = f;
			return g | 0
		}
		return 0
	}
	function Tf(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		f = i;
		switch (e | 0) {
		case 16:
			{
				Yf(a, b, c, d);
				break
			};
		case 8:
			{
				Vf(a, b, c, d);
				break
			};
		case 6:
			{
				Uf(a, b, c, d);
				break
			};
		case 12:
			{
				Xf(a, b, c, d);
				break
			};
		case 10:
			{
				Wf(a, b, c, d);
				break
			};
		default:
			{}
		}
		wj(a | 0, 0, e << 2 | 0) | 0;
		i = f;
		return
	}
	function Uf(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		k = i;
		h = b + 4 | 0;
		j = b + 8 | 0;
		e = b + 12 | 0;
		l = b + 16 | 0;
		m = b + 20 | 0;
		f = 6;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - (+g[c + (f + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (f + -2 << 2) >> 2] * +g[h >> 2] + +g[c + (f + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (f + -4 << 2) >> 2] * +g[e >> 2] + +g[c + (f + -5 << 2) >> 2] * +g[l >> 2] + +g[c + (f + -6 << 2) >> 2] * +g[m >> 2]);
			f = f + 1 | 0
		}
		i = k;
		return
	}
	function Vf(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		l = i;
		h = b + 4 | 0;
		j = b + 8 | 0;
		k = b + 12 | 0;
		e = b + 16 | 0;
		m = b + 20 | 0;
		n = b + 24 | 0;
		o = b + 28 | 0;
		f = 8;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - (+g[c + (f + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (f + -2 << 2) >> 2] * +g[h >> 2] + +g[c + (f + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (f + -4 << 2) >> 2] * +g[k >> 2] + +g[c + (f + -5 << 2) >> 2] * +g[e >> 2] + +g[c + (f + -6 << 2) >> 2] * +g[m >> 2] + +g[c + (f + -7 << 2) >> 2] * +g[n >> 2] + +g[c + (f + -8 << 2) >> 2] * +g[o >> 2]);
			f = f + 1 | 0
		}
		i = l;
		return
	}
	function Wf(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		m = i;
		h = b + 4 | 0;
		j = b + 8 | 0;
		k = b + 12 | 0;
		l = b + 16 | 0;
		e = b + 20 | 0;
		n = b + 24 | 0;
		o = b + 28 | 0;
		p = b + 32 | 0;
		q = b + 36 | 0;
		f = 10;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - (+g[c + (f + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (f + -2 << 2) >> 2] * +g[h >> 2] + +g[c + (f + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (f + -4 << 2) >> 2] * +g[k >> 2] + +g[c + (f + -5 << 2) >> 2] * +g[l >> 2] + +g[c + (f + -6 << 2) >> 2] * +g[e >> 2] + +g[c + (f + -7 << 2) >> 2] * +g[n >> 2] + +g[c + (f + -8 << 2) >> 2] * +g[o >> 2] + +g[c + (f + -9 << 2) >> 2] * +g[p >> 2] + +g[c + (f + -10 << 2) >> 2] * +g[q >> 2]);
			f = f + 1 | 0
		}
		i = m;
		return
	}
	function Xf(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		n = i;
		h = b + 4 | 0;
		j = b + 8 | 0;
		k = b + 12 | 0;
		l = b + 16 | 0;
		m = b + 20 | 0;
		e = b + 24 | 0;
		o = b + 28 | 0;
		p = b + 32 | 0;
		q = b + 36 | 0;
		r = b + 40 | 0;
		s = b + 44 | 0;
		f = 12;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - (+g[c + (f + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (f + -2 << 2) >> 2] * +g[h >> 2] + +g[c + (f + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (f + -4 << 2) >> 2] * +g[k >> 2] + +g[c + (f + -5 << 2) >> 2] * +g[l >> 2] + +g[c + (f + -6 << 2) >> 2] * +g[m >> 2] + +g[c + (f + -7 << 2) >> 2] * +g[e >> 2] + +g[c + (f + -8 << 2) >> 2] * +g[o >> 2] + +g[c + (f + -9 << 2) >> 2] * +g[p >> 2] + +g[c + (f + -10 << 2) >> 2] * +g[q >> 2] + +g[c + (f + -11 << 2) >> 2] * +g[r >> 2] + +g[c + (f + -12 << 2) >> 2] * +g[s >> 2]);
			f = f + 1 | 0
		}
		i = n;
		return
	}
	function Yf(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		p = i;
		h = b + 4 | 0;
		j = b + 8 | 0;
		k = b + 12 | 0;
		l = b + 16 | 0;
		m = b + 20 | 0;
		n = b + 24 | 0;
		o = b + 28 | 0;
		e = b + 32 | 0;
		q = b + 36 | 0;
		r = b + 40 | 0;
		s = b + 44 | 0;
		t = b + 48 | 0;
		u = b + 52 | 0;
		v = b + 56 | 0;
		w = b + 60 | 0;
		f = 16;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - (+g[c + (f + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (f + -2 << 2) >> 2] * +g[h >> 2] + +g[c + (f + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (f + -4 << 2) >> 2] * +g[k >> 2] + +g[c + (f + -5 << 2) >> 2] * +g[l >> 2] + +g[c + (f + -6 << 2) >> 2] * +g[m >> 2] + +g[c + (f + -7 << 2) >> 2] * +g[n >> 2] + +g[c + (f + -8 << 2) >> 2] * +g[o >> 2] + +g[c + (f + -9 << 2) >> 2] * +g[e >> 2] + +g[c + (f + -10 << 2) >> 2] * +g[q >> 2] + +g[c + (f + -11 << 2) >> 2] * +g[r >> 2] + +g[c + (f + -12 << 2) >> 2] * +g[s >> 2] + +g[c + (f + -13 << 2) >> 2] * +g[t >> 2] + +g[c + (f + -14 << 2) >> 2] * +g[u >> 2] + +g[c + (f + -15 << 2) >> 2] * +g[v >> 2] + +g[c + (f + -16 << 2) >> 2] * +g[w >> 2]);
			f = f + 1 | 0
		}
		i = p;
		return
	}
	function Zf(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0;
		c = i;
		i = i + 128 | 0;
		e = c;
		m = e + ((b & 1) << 6) | 0;
		yj(m | 0, a | 0, b << 2 | 0) | 0;
		a = m;
		j = 1.0;
		a: while (1) {
			b = b + -1 | 0;
			if ((b | 0) <= 0) break;
			f = +g[a + (b << 2) >> 2];
			h = -f;
			if (f < -.9998999834060669 | f > .9998999834060669) {
				f = 0.0;
				d = 9;
				break
			}
			n = 1.0 - h * h;
			f = 1.0 / n;
			j = j * n;
			l = b & 1;
			k = e + (l << 6) | 0;
			m = 0;
			while (1) {
				if ((m | 0) >= (b | 0)) {
					a = k;
					continue a
				}
				g[e + (l << 6) + (m << 2) >> 2] = (+g[a + (m << 2) >> 2] - +g[a + (b - m + -1 << 2) >> 2] * h) * f;
				m = m + 1 | 0
			}
		}
		if ((d | 0) == 9) {
			i = c;
			return +f
		}
		n = +g[a >> 2];
		f = -n;
		if (n < -.9998999834060669 | n > .9998999834060669) {
			n = 0.0;
			i = c;
			return +n
		}
		n = j * (1.0 - f * f);
		i = c;
		return +n
	}
	function _f(a, b, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0.0;
		m = i;
		i = i + 32 | 0;
		l = m;
		k = h + k | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (j | 0)) break;
			s = b + (0 - (c[e + (n << 2) >> 2] | 0) << 2) | 0;
			o = +g[f + (n << 2) >> 2];
			r = n * 5 | 0;
			p = 0;
			while (1) {
				if ((p | 0) >= 5) {
					p = 0;
					break
				}
				g[l + (p << 2) >> 2] = +g[d + (r + p << 2) >> 2];
				p = p + 1 | 0
			}
			while (1) {
				if ((p | 0) >= (k | 0)) break;
				q = +g[b + (p << 2) >> 2];
				t = a + (p << 2) | 0;
				g[t >> 2] = q;
				r = 0;
				while (1) {
					if ((r | 0) >= 5) break;
					u = q - +g[l + (r << 2) >> 2] * +g[s + (2 - r << 2) >> 2];
					g[t >> 2] = u;
					q = u;
					r = r + 1 | 0
				}
				g[t >> 2] = q * o;
				p = p + 1 | 0;
				s = s + 4 | 0
			}
			a = a + (k << 2) | 0;
			n = n + 1 | 0;
			b = b + (h << 2) | 0
		}
		i = m;
		return
	}
	function $f(d, e, f) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0.0;
		h = i;
		if (!f) {
			j = +((c[d + 4640 >> 2] | 0) + (c[d + 5776 >> 2] | 0) | 0) * +g[e + 872 >> 2] * .10000000149011612;
			if (!(j > 2.0)) if (j < 0.0) f = 0;
			else f = ~~j;
			else f = 2;
			a[d + 4801 >> 0] = f
		} else {
			a[d + 4801 >> 0] = 0;
			f = 0
		}
		g[e + 224 >> 2] = +(b[24976 + (f << 24 >> 24 << 1) >> 1] | 0) * 6103515625.0e-14;
		i = h;
		return
	}
	function ag(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0.0,
			l = 0;
		e = i;
		j = 3.1415927410125732 / +(d + 1 | 0);
		f = 2.0 - j * j;
		if ((c | 0) < 2) {
			h = 0.0;
			c = 0
		} else {
			h = 1.0;
			j = f * .5;
			c = 0
		}
		while (1) {
			if ((c | 0) >= (d | 0)) break;
			g[a + (c << 2) >> 2] = +g[b + (c << 2) >> 2] * .5 * (h + j);
			l = c | 1;
			g[a + (l << 2) >> 2] = +g[b + (l << 2) >> 2] * j;
			k = f * j - h;
			l = c | 2;
			g[a + (l << 2) >> 2] = +g[b + (l << 2) >> 2] * .5 * (j + k);
			l = c | 3;
			g[a + (l << 2) >> 2] = +g[b + (l << 2) >> 2] * k;
			h = k;
			j = f * k - j;
			c = c + 4 | 0
		}
		i = e;
		return
	}
	function bg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		d = (d | 0) > (c | 0) ? c : d;
		f = 0;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +ug(b, b + (f << 2) | 0, c - f | 0);
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function cg(a, b, d, e, f, j) {
		a = a | 0;
		b = b | 0;
		d = +d;
		e = e | 0;
		f = f | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0,
			u = 0.0,
			v = 0,
			w = 0.0,
			x = 0.0,
			y = 0,
			z = 0,
			A = 0,
			B = 0.0,
			C = 0,
			D = 0,
			E = 0.0,
			F = 0.0,
			G = 0.0,
			H = 0;
		k = i;
		i = i + 656 | 0;
		p = k + 528 | 0;
		r = k + 400 | 0;
		m = k + 264 | 0;
		q = k + 128 | 0;
		l = k;
		n = +og(b, $(f, e) | 0);
		t = p + 0 | 0;
		v = t + 128 | 0;
		do {
			c[t >> 2] = 0;
			t = t + 4 | 0
		} while ((t | 0) < (v | 0));
		y = j + 1 | 0;
		v = 0;
		while (1) {
			if ((v | 0) >= (f | 0)) break;
			z = $(v, e) | 0;
			t = b + (z << 2) | 0;
			A = 1;
			while (1) {
				if ((A | 0) >= (y | 0)) break;
				B = +ug(t, b + (z + A << 2) | 0, e - A | 0);
				D = p + (A + -1 << 3) | 0;
				h[D >> 3] = +h[D >> 3] + B;
				A = A + 1 | 0
			}
			v = v + 1 | 0
		}
		t = r + 0 | 0;
		y = p + 0 | 0;
		v = t + 128 | 0;
		do {
			c[t >> 2] = c[y >> 2];
			t = t + 4 | 0;
			y = y + 4 | 0
		} while ((t | 0) < (v | 0));
		s = n * 9999999747378752.0e-21;
		u = n + s + 9.999999717180685e-10;
		h[m >> 3] = u;
		h[q >> 3] = u;
		u = 1.0;
		t = 0;
		a: while (1) {
			if ((t | 0) >= (j | 0)) break;
			y = e - t | 0;
			v = y + -1 | 0;
			z = 0;
			while (1) {
				if ((z | 0) >= (f | 0)) break;
				A = $(z, e) | 0;
				B = +g[b + (A + v << 2) >> 2];
				C = b + (A + t << 2) | 0;
				D = 0;
				x = +g[b + (A + t << 2) >> 2];
				w = B;
				while (1) {
					if ((D | 0) >= (t | 0)) {
						C = 0;
						break
					}
					G = +g[b + (A + (t - D + -1) << 2) >> 2];
					H = p + (D << 3) | 0;
					h[H >> 3] = +h[H >> 3] - +g[C >> 2] * G;
					F = +g[b + (A + (y + D) << 2) >> 2];
					H = r + (D << 3) | 0;
					h[H >> 3] = +h[H >> 3] - B * F;
					E = +h[l + (D << 3) >> 3];
					D = D + 1 | 0;
					x = x + G * E;
					w = w + F * E
				}
				while (1) {
					if ((C | 0) > (t | 0)) break;
					H = m + (C << 3) | 0;
					h[H >> 3] = +h[H >> 3] - x * +g[b + (A + (t - C) << 2) >> 2];
					H = q + (C << 3) | 0;
					h[H >> 3] = +h[H >> 3] - w * +g[b + (A + (y + C + -1) << 2) >> 2];
					C = C + 1 | 0
				}
				z = z + 1 | 0
			}
			v = 0;
			x = +h[p + (t << 3) >> 3];
			w = +h[r + (t << 3) >> 3];
			while (1) {
				if ((v | 0) >= (t | 0)) break;
				G = +h[l + (v << 3) >> 3];
				H = t - v + -1 | 0;
				v = v + 1 | 0;
				x = x + +h[r + (H << 3) >> 3] * G;
				w = w + +h[p + (H << 3) >> 3] * G
			}
			v = t + 1 | 0;
			h[m + (v << 3) >> 3] = x;
			h[q + (v << 3) >> 3] = w;
			x = +h[q >> 3];
			B = +h[m >> 3];
			y = 0;
			while (1) {
				if ((y | 0) >= (t | 0)) break;
				G = +h[l + (y << 3) >> 3];
				H = y + 1 | 0;
				x = x + +h[q + (H << 3) >> 3] * G;
				B = B + +h[m + (H << 3) >> 3] * G;
				w = w + +h[q + (t - y << 3) >> 3] * G;
				y = H
			}
			x = w * -2.0 / (B + x);
			B = u * (1.0 - x * x);
			if (B <= d) {
				x = +P(+(1.0 - d / u));
				if (w > 0.0) {
					u = d;
					w = -x;
					y = 1
				} else {
					u = d;
					w = x;
					y = 1
				}
			} else {
				u = B;
				w = x;
				y = 0
			}
			z = v >> 1;
			A = 0;
			while (1) {
				if ((A | 0) >= (z | 0)) break;
				D = l + (A << 3) | 0;
				G = +h[D >> 3];
				H = l + (t - A + -1 << 3) | 0;
				F = +h[H >> 3];
				h[D >> 3] = G + w * F;
				h[H >> 3] = F + w * G;
				A = A + 1 | 0
			}
			h[l + (t << 3) >> 3] = w;
			if (!y) y = 0;
			else {
				o = 30;
				break
			}
			while (1) {
				if ((y | 0) > (v | 0)) {
					t = v;
					continue a
				}
				D = m + (y << 3) | 0;
				G = +h[D >> 3];
				H = q + (t - y + 1 << 3) | 0;
				F = +h[H >> 3];
				h[D >> 3] = G + w * F;
				h[H >> 3] = F + w * G;
				y = y + 1 | 0
			}
		}
		if ((o | 0) == 30) {
			while (1) {
				t = t + 1 | 0;
				if ((t | 0) >= (j | 0)) break;
				h[l + (t << 3) >> 3] = 0.0;
				o = 30
			}
			if (y) {
				m = 0;
				while (1) {
					if ((m | 0) >= (j | 0)) {
						a = 0;
						break
					}
					g[a + (m << 2) >> 2] = -+h[l + (m << 3) >> 3];
					m = m + 1 | 0
				}
				while (1) {
					if ((a | 0) >= (f | 0)) break;
					n = n - +og(b + (($(a, e) | 0) << 2) | 0, j);
					a = a + 1 | 0
				}
				G = n * u;
				i = k;
				return +G
			}
		}
		d = +h[m >> 3];
		b = 0;
		n = 1.0;
		while (1) {
			if ((b | 0) >= (j | 0)) break;
			G = +h[l + (b << 3) >> 3];
			H = b + 1 | 0;
			F = d + +h[m + (H << 3) >> 3] * G;
			g[a + (b << 2) >> 2] = -G;
			d = F;
			b = H;
			n = n + G * G
		}
		G = d - s * n;
		i = k;
		return +G
	}
	function dg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = +c;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0;
		d = i;
		b = b + -1 | 0;
		e = c;
		f = 0;
		while (1) {
			if ((f | 0) >= (b | 0)) break;
			h = a + (f << 2) | 0;
			g[h >> 2] = +g[h >> 2] * e;
			e = e * c;
			f = f + 1 | 0
		}
		h = a + (b << 2) | 0;
		g[h >> 2] = +g[h >> 2] * e;
		i = d;
		return
	}
	function eg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		a = a + 16 | 0;
		f = 0;
		while (1) {
			if ((f | 0) >= 5) break;
			g[d + (f << 2) >> 2] = +ug(a, b, c);
			a = a + -4 | 0;
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function fg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0;
		e = i;
		d = a + 16 | 0;
		l = +og(d, b);
		g[c >> 2] = l;
		f = 1;
		while (1) {
			if ((f | 0) >= 5) break;
			n = +g[a + (4 - f << 2) >> 2];
			m = +g[a + (b - f + 4 << 2) >> 2];
			m = l + (n * n - m * m);
			g[c + (f * 6 << 2) >> 2] = m;
			l = m;
			f = f + 1 | 0
		}
		f = a + 12 | 0;
		h = 1;
		while (1) {
			if ((h | 0) >= 5) break;
			l = +ug(d, f, b);
			n = l;
			g[c + (h * 5 << 2) >> 2] = n;
			g[c + (h << 2) >> 2] = n;
			j = 5 - h | 0;
			k = 1;
			while (1) {
				if ((k | 0) >= (j | 0)) break;
				o = b - k | 0;
				n = l + (+g[a + (4 - k << 2) >> 2] * +g[f + (0 - k << 2) >> 2] - +g[a + (o + 4 << 2) >> 2] * +g[f + (o << 2) >> 2]);
				m = n;
				o = h + k | 0;
				g[c + ((o * 5 | 0) + k << 2) >> 2] = m;
				g[c + ((k * 5 | 0) + o << 2) >> 2] = m;
				l = n;
				k = k + 1 | 0
			}
			f = f + -4 | 0;
			h = h + 1 | 0
		}
		i = e;
		return
	}
	function gg(b) {
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		d = i;
		Ye(b, b + 5130 | 0);
		if ((c[b + 4556 >> 2] | 0) >= 13) {
			c[b + 6116 >> 2] = 0;
			c[b + 6112 >> 2] = 0;
			a[b + 4797 >> 0] = 1;
			a[b + (c[b + 5780 >> 2] | 0) + 4752 >> 0] = 1;
			i = d;
			return
		}
		a[b + 4797 >> 0] = 0;
		e = b + 6116 | 0;
		f = c[e >> 2] | 0;
		g = f + 1 | 0;
		c[e >> 2] = g;
		if ((g | 0) >= 10) {
			if ((f | 0) > 29) {
				c[e >> 2] = 10;
				c[b + 6112 >> 2] = 0
			}
		} else c[b + 6112 >> 2] = 0;
		a[b + (c[b + 5780 >> 2] | 0) + 4752 >> 0] = 0;
		i = d;
		return
	}
	function hg(d, e, f, h, j, k) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0;
		w = i;
		i = i + 15040 | 0;
		u = w + 12840 | 0;
		n = w + 11560 | 0;
		C = w + 8872 | 0;
		m = w + 8824 | 0;
		r = w + 24 | 0;
		s = w;
		y = w + 4444 | 0;
		l = w + 64 | 0;
		v = w + 48 | 0;
		t = w + 13752 | 0;
		z = d + 4644 | 0;
		p = c[z >> 2] | 0;
		c[z >> 2] = p + 1;
		z = d + 4802 | 0;
		a[z >> 0] = p & 3;
		p = d + 4616 | 0;
		E = c[p >> 2] | 0;
		B = d + (E << 2) + 9356 | 0;
		D = C + (E << 2) | 0;
		A = d + 5130 | 0;
		o = d + 4608 | 0;
		Xd(d + 16 | 0, A, c[o >> 2] | 0);
		q = d + 4600 | 0;
		ig(d + (E + ((c[q >> 2] | 0) * 5 | 0) << 2) + 9356 | 0, A, c[o >> 2] | 0);
		A = 0;
		while (1) {
			if ((A | 0) >= 8) break;
			la = d + (E + (((c[q >> 2] | 0) * 5 | 0) + ($(A, c[o >> 2] >> 3) | 0)) << 2) + 9356 | 0;
			g[la >> 2] = +g[la >> 2] + +(1 - (A & 2) | 0) * 9.999999974752427e-7;
			A = A + 1 | 0
		}
		A = d + 4712 | 0;
		a: do
		if (!(c[A >> 2] | 0)) {
			sg(d, u, C, B, c[d + 5124 >> 2] | 0);
			xg(d, u, D, B);
			tg(d, u, C, B, h);
			Ng(d, u, h);
			Kg(d, u, n, B);
			jg(d, u, n, h);
			J = d + 4768 | 0;
			D = d + 4604 | 0;
			ha = jh(J, c[D >> 2] | 0) | 0;
			ia = m + 0 | 0;
			la = f + 0 | 0;
			ja = ia + 48 | 0;
			do {
				c[ia >> 2] = c[la >> 2];
				ia = ia + 4 | 0;
				la = la + 4 | 0
			} while ((ia | 0) < (ja | 0));
			N = d + 144 | 0;
			yj(y | 0, N | 0, 4380) | 0;
			V = a[z >> 0] | 0;
			L = d + 5804 | 0;
			U = b[L >> 1] | 0;
			H = d + 5800 | 0;
			K = c[H >> 2] | 0;
			F = u + 852 | 0;
			B = u + 908 | 0;
			I = d + 7200 | 0;
			E = (h | 0) == 2 & 1;
			C = j + -5 | 0;
			G = f + 24 | 0;
			T = f + 28 | 0;
			M = d + 4768 | 0;
			O = d + 4804 | 0;
			P = d + 5780 | 0;
			Q = d + 4797 | 0;
			R = d + 4798 | 0;
			S = f + 20 | 0;
			k = (k | 0) == 0;
			X = 0;
			Y = 0;
			Z = 0;
			ga = 256;
			_ = 0;
			aa = 0;
			ba = -1;
			da = -1;
			ea = 0;
			fa = 0;
			ca = 0;
			W = 0;
			while (1) {
				ka = (ha | 0) == (ba | 0);
				if (!ka) if ((ha | 0) != (da | 0)) {
					if ((W | 0) > 0) {
						ia = f + 0 | 0;
						la = m + 0 | 0;
						ja = ia + 48 | 0;
						do {
							c[ia >> 2] = c[la >> 2];
							ia = ia + 4 | 0;
							la = la + 4 | 0
						} while ((ia | 0) < (ja | 0));
						yj(N | 0, y | 0, 4380) | 0;
						a[z >> 0] = V;
						b[L >> 1] = U;
						c[H >> 2] = K
					}
					dh(d, u, M, N, O, n);
					Qf(d, f, c[P >> 2] | 0, 0, h);
					Rf(f, a[Q >> 0] | 0, a[R >> 0] | 0, O, c[o >> 2] | 0);
					ja = kg(c[S >> 2] | 0, c[T >> 2] | 0) | 0;
					if (k & (W | 0) == 0) {
						if ((ja | 0) <= (j | 0)) break a
					} else x = 12
				} else {
					ja = fa;
					x = 12
				} else {
					ja = ea;
					x = 12
				}
				if ((x | 0) == 12) {
					x = 0;
					if ((W | 0) == 6) break
				}
				ia = (ja | 0) > (j | 0);
				do
				if (ia) if ((Y | 0) == 0 & (W | 0) > 1) {
					g[F >> 2] = +g[F >> 2] * 1.5;
					Z = 0;
					da = -1;
					break
				} else {
					Z = 1;
					aa = ga << 16 >> 16;
					da = ha;
					fa = ja;
					break
				} else {
					if ((ja | 0) >= (C | 0)) break a;
					_ = ga << 16 >> 16;
					if (ka) {
						Y = 1;
						ba = ha;
						ea = ja
					} else {
						c[r + 0 >> 2] = c[f + 0 >> 2];
						c[r + 4 >> 2] = c[f + 4 >> 2];
						c[r + 8 >> 2] = c[f + 8 >> 2];
						c[r + 12 >> 2] = c[f + 12 >> 2];
						c[r + 16 >> 2] = c[f + 16 >> 2];
						c[r + 20 >> 2] = c[f + 20 >> 2];
						ca = c[G >> 2] | 0;
						c[s + 0 >> 2] = c[T + 0 >> 2];
						c[s + 4 >> 2] = c[T + 4 >> 2];
						c[s + 8 >> 2] = c[T + 8 >> 2];
						c[s + 12 >> 2] = c[T + 12 >> 2];
						c[s + 16 >> 2] = c[T + 16 >> 2];
						yj(t | 0, c[f >> 2] | 0, ca | 0) | 0;
						yj(l | 0, N | 0, 4380) | 0;
						X = a[I >> 0] | 0;
						Y = 1;
						ba = ha;
						ea = ja
					}
				}
				while (0);
				do
				if (Y & Z) {
					ha = aa - _ | 0;
					ia = _ + (($(ha, j - ea | 0) | 0) / (fa - ea | 0) | 0) | 0;
					ga = ha >> 2;
					if ((ia << 16 >> 16 | 0) > (_ + ga | 0)) {
						ia = _ + (ha >>> 2) | 0;
						break
					}
					if ((ia << 16 >> 16 | 0) < (aa - ga | 0)) ia = aa - (ha >>> 2) | 0
				} else {
					ha = lg(sh(((ja - j << 7 | 0) / (c[o >> 2] | 0) | 0) + 2048 | 0) | 0) | 0;
					if (ia) ha = mg(ha) | 0;
					ia = ga << 16 >> 16;
					ia = ($(ha >> 16, ia) | 0) + (($(ha & 65535, ia) | 0) >>> 16) | 0
				}
				while (0);
				ga = ia & 65535;
				ha = c[D >> 2] | 0;
				ja = ia << 16 >> 16;
				ia = 0;
				while (1) {
					if ((ia | 0) >= (ha | 0)) break;
					ka = c[u + (ia << 2) + 892 >> 2] | 0;
					ka = ($(ka >> 16, ja) | 0) + (($(ka & 65535, ja) | 0) >> 16) | 0;
					if ((ka | 0) > 8388607) ka = 2147483392;
					else ka = (ka | 0) < -8388608 ? -2147483648 : ka << 8;
					c[v + (ia << 2) >> 2] = ka;
					ia = ia + 1 | 0
				}
				a[I >> 0] = a[B >> 0] | 0;
				fh(J, v, I, E, ha);
				ia = c[D >> 2] | 0;
				ha = jh(J, ia) | 0;
				ja = 0;
				while (1) {
					if ((ja | 0) >= (ia | 0)) break;
					g[u + (ja << 2) >> 2] = +(c[v + (ja << 2) >> 2] | 0) * 152587890625.0e-16;
					ja = ja + 1 | 0
				}
				W = W + 1 | 0
			}
			if ((Y | 0) != 0 ? ka | (ja | 0) > (j | 0) : 0) {
				c[f + 0 >> 2] = c[r + 0 >> 2];
				c[f + 4 >> 2] = c[r + 4 >> 2];
				c[f + 8 >> 2] = c[r + 8 >> 2];
				c[f + 12 >> 2] = c[r + 12 >> 2];
				c[f + 16 >> 2] = c[r + 16 >> 2];
				c[f + 20 >> 2] = c[r + 20 >> 2];
				c[G >> 2] = ca;
				c[T + 0 >> 2] = c[s + 0 >> 2];
				c[T + 4 >> 2] = c[s + 4 >> 2];
				c[T + 8 >> 2] = c[s + 8 >> 2];
				c[T + 12 >> 2] = c[s + 12 >> 2];
				c[T + 16 >> 2] = c[s + 16 >> 2];
				yj(c[f >> 2] | 0, t | 0, ca | 0) | 0;
				yj(N | 0, l | 0, 4380) | 0;
				a[I >> 0] = X
			}
		}
		while (0);
		zj(d + 9356 | 0, d + (c[o >> 2] << 2) + 9356 | 0, (c[p >> 2] | 0) + ((c[q >> 2] | 0) * 5 | 0) << 2 | 0) | 0;
		if (c[A >> 2] | 0) {
			la = 0;
			c[e >> 2] = la;
			i = w;
			return 0
		}
		c[d + 4568 >> 2] = c[u + ((c[d + 4604 >> 2] | 0) + -1 << 2) + 228 >> 2];
		a[d + 4565 >> 0] = a[d + 4797 >> 0] | 0;
		c[d + 4696 >> 2] = 0;
		la = (kg(c[f + 20 >> 2] | 0, c[f + 28 >> 2] | 0) | 0) + 7 >> 3;
		c[e >> 2] = la;
		i = w;
		return 0
	}
	function ig(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			g[a + (f << 2) >> 2] = +(b[c + (f << 1) >> 1] | 0);
			d = f
		}
		i = e;
		return
	}
	function jg(e, f, h, j) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		p = i;
		i = i + 4416 | 0;
		n = p + 4400 | 0;
		k = p + 4384 | 0;
		o = p;
		l = e + 5780 | 0;
		q = c[l >> 2] | 0;
		m = e + (q * 36 | 0) + 6132 | 0;
		if (!(c[e + 6124 >> 2] | 0)) {
			i = p;
			return
		}
		if ((c[e + 4556 >> 2] | 0) <= 77) {
			i = p;
			return
		}
		c[e + (q << 2) + 4756 >> 2] = 1;
		yj(o | 0, e + 144 | 0, 4380) | 0;
		s = m + 0 | 0;
		r = e + 4768 | 0;
		q = s + 36 | 0;
		do {
			b[s >> 1] = b[r >> 1] | 0;
			s = s + 2 | 0;
			r = r + 2 | 0
		} while ((s | 0) < (q | 0));
		q = e + 4604 | 0;
		s = c[q >> 2] | 0;
		yj(k | 0, f | 0, s << 2 | 0) | 0;
		r = c[l >> 2] | 0;
		if ((r | 0) != 0 ? (c[e + (r + -1 << 2) + 4756 >> 2] | 0) != 0 : 0) r = e + 4564 | 0;
		else {
			r = e + 4564 | 0;
			a[r >> 0] = a[e + 7200 >> 0] | 0;
			a[m >> 0] = ng((d[m >> 0] | 0) + (c[e + 6128 >> 2] | 0) << 24 >> 24) | 0;
			s = c[q >> 2] | 0
		}
		hh(n, m, r, (j | 0) == 2 & 1, s);
		j = 0;
		while (1) {
			if ((j | 0) >= (c[q >> 2] | 0)) break;
			g[f + (j << 2) >> 2] = +(c[n + (j << 2) >> 2] | 0) * 152587890625.0e-16;
			j = j + 1 | 0
		}
		dh(e, f, m, o, e + ((c[l >> 2] | 0) * 320 | 0) + 6240 | 0, h);
		yj(f | 0, k | 0, c[q >> 2] << 2 | 0) | 0;
		i = p;
		return
	}
	function kg(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function lg(a) {
		a = a | 0;
		return ((a | 0) < 131072 ? a : 131072) | 0
	}
	function mg(a) {
		a = a | 0;
		return ((a | 0) > 85197 ? a : 85197) | 0
	}
	function ng(a) {
		a = a | 0;
		return ((a | 0) < 63 ? a : 63) | 0
	}
	function og(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0.0,
			e = 0,
			f = 0,
			h = 0.0,
			j = 0.0,
			k = 0.0,
			l = 0.0;
		c = i;
		f = b & 65532;
		d = 0.0;
		e = 0;
		while (1) {
			if ((e | 0) >= (f | 0)) break;
			l = +g[a + (e << 2) >> 2];
			k = +g[a + ((e | 1) << 2) >> 2];
			j = +g[a + ((e | 2) << 2) >> 2];
			h = +g[a + ((e | 3) << 2) >> 2];
			d = d + (l * l + k * k + j * j + h * h);
			e = e + 4 | 0
		}
		while (1) {
			if ((e | 0) >= (b | 0)) break;
			l = +g[a + (e << 2) >> 2];
			e = e + 1 | 0;
			d = d + l * l
		}
		i = c;
		return +d
	}
	function pg(b, d, e, f) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = +f;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0.0,
			t = 0,
			u = 0;
		p = i;
		i = i + 1696 | 0;
		g = p + 1600 | 0;
		k = p + 1664 | 0;
		l = p + 1536 | 0;
		m = p;
		h = b + 4664 | 0;
		o = c[h >> 2] | 0;
		n = (c[b + 4612 >> 2] | 0) + o | 0;
		j = b + 4799 | 0;
		a[j >> 0] = 4;
		q = b + 4604 | 0;
		r = +cg(g, e, f, n, c[q >> 2] | 0, o);
		a: do
		if (((c[b + 4656 >> 2] | 0) != 0 ? (c[b + 4696 >> 2] | 0) == 0 : 0) ? (c[q >> 2] | 0) == 4 : 0) {
			o = n << 1;
			r = r - +cg(l, e + (o << 2) | 0, f, n, 2, c[h >> 2] | 0);
			$g(d, l, c[h >> 2] | 0);
			b = b + 4524 | 0;
			s = 3.4028234663852886e+38;
			q = 3;
			while (1) {
				if ((q | 0) <= -1) break a;
				nh(k, b, d, q, c[h >> 2] | 0);
				bh(l, k, c[h >> 2] | 0);
				Tf(m, l, e, o, c[h >> 2] | 0);
				u = c[h >> 2] | 0;
				t = n - u | 0;
				f = +og(m + (u << 2) | 0, t);
				f = f + +og(m + (u + n << 2) | 0, t);
				if (!(f < r)) {
					if (f > s) break a
				} else {
					a[j >> 0] = q;
					r = f
				}
				s = f;
				q = q + -1 | 0
			}
		}
		while (0);
		if ((a[j >> 0] | 0) != 4) {
			i = p;
			return
		}
		$g(d, g, c[h >> 2] | 0);
		i = p;
		return
	}
	function qg(a, b, d, e, f, h, j, k, l) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0,
			v = 0.0,
			w = 0.0,
			x = 0,
			y = 0.0;
		m = i;
		i = i + 112 | 0;
		o = m + 96 | 0;
		p = m + 72 | 0;
		n = m + 56 | 0;
		r = m + 40 | 0;
		s = m + 16 | 0;
		q = m;
		t = +(j | 0) * .009999999776482582;
		u = a;
		e = e + (l << 2) | 0;
		l = 0;
		while (1) {
			if ((l | 0) >= (k | 0)) break;
			x = e + (-2 - (c[f + (l << 2) >> 2] | 0) << 2) | 0;
			fg(x, j, b);
			eg(x, e, j, s);
			v = +og(e, j);
			x = q + (l << 2) | 0;
			g[x >> 2] = v;
			Pg(b, x, (v + 1.0 + +g[b >> 2] + +g[b + 96 >> 2]) * .01666666753590107);
			Vg(b, s, u);
			v = +Qg(u, b, s, +g[x >> 2]);
			g[r + (l << 2) >> 2] = v;
			w = +g[h + (l << 2) >> 2];
			Tg(b, w / (v * w + t));
			g[n + (l << 2) >> 2] = +g[b + 48 >> 2];
			b = b + 100 | 0;
			u = u + 20 | 0;
			e = e + (j << 2) | 0;
			l = l + 1 | 0
		}
		if (!d) {
			h = a;
			q = 0
		} else {
			t = 9.999999974752427e-7;
			v = 0.0;
			s = 0;
			while (1) {
				if ((s | 0) >= (k | 0)) break;
				w = +g[h + (s << 2) >> 2];
				t = t + +g[r + (s << 2) >> 2] * w;
				v = v + +g[q + (s << 2) >> 2] * w;
				s = s + 1 | 0
			}
			g[d >> 2] = +rg(v / t) * 3.0;
			h = a;
			q = 0
		}
		while (1) {
			if ((q | 0) >= (k | 0)) {
				q = 0;
				t = .0010000000474974513;
				break
			}
			d = o + (q << 2) | 0;
			g[d >> 2] = 0.0;
			t = 0.0;
			r = 0;
			while (1) {
				if ((r | 0) >= 5) break;
				w = t + +g[h + (r << 2) >> 2];
				g[d >> 2] = w;
				t = w;
				r = r + 1 | 0
			}
			h = h + 20 | 0;
			q = q + 1 | 0
		}
		while (1) {
			if ((q | 0) >= (k | 0)) {
				v = 0.0;
				q = 0;
				break
			}
			w = t + +g[n + (q << 2) >> 2];
			q = q + 1 | 0;
			t = w
		}
		while (1) {
			if ((q | 0) >= (k | 0)) break;
			v = v + +g[o + (q << 2) >> 2] * +g[n + (q << 2) >> 2];
			q = q + 1 | 0
		}
		t = v / t;
		q = 0;
		while (1) {
			if ((q | 0) >= (k | 0)) break;
			v = .10000000149011612 / (+g[n + (q << 2) >> 2] + .10000000149011612) * (t - +g[o + (q << 2) >> 2]);
			h = 0;
			w = 0.0;
			while (1) {
				if ((h | 0) >= 5) break;
				y = +g[a + (h << 2) >> 2];
				y = y > .10000000149011612 ? y : .10000000149011612;
				g[p + (h << 2) >> 2] = y;
				h = h + 1 | 0;
				w = w + y
			}
			v = v / w;
			h = 0;
			while (1) {
				if ((h | 0) >= 5) break;
				x = a + (h << 2) | 0;
				g[x >> 2] = +g[x >> 2] + +g[p + (h << 2) >> 2] * v;
				h = h + 1 | 0
			}
			a = a + 20 | 0;
			q = q + 1 | 0
		}
		i = m;
		return
	}
	function rg(a) {
		a = +a;
		var b = 0;
		b = i;
		a = +la(+a) * 3.32192809488736;
		i = b;
		return +a
	}
	function sg(d, e, f, h, j) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0;
		k = i;
		i = i + 1744 | 0;
		r = k + 1664 | 0;
		o = k + 1600 | 0;
		p = k + 1536 | 0;
		t = k;
		l = d + 4620 | 0;
		u = c[l >> 2] | 0;
		n = u + (c[d + 4608 >> 2] | 0) | 0;
		m = c[d + 4616 >> 2] | 0;
		s = d + 4572 | 0;
		v = n - (c[s >> 2] | 0) | 0;
		ag(t, h + (v << 2) | 0, 1, u);
		l = c[l >> 2] | 0;
		v = v + l | 0;
		u = (c[s >> 2] | 0) - (l << 1) | 0;
		yj(t + (l << 2) | 0, h + (v << 2) | 0, u << 2 | 0) | 0;
		ag(t + (l + u << 2) | 0, h + (v + u << 2) | 0, 2, l);
		l = d + 4672 | 0;
		bg(r, t, c[s >> 2] | 0, (c[l >> 2] | 0) + 1 | 0);
		q = +g[r >> 2];
		g[r >> 2] = q + (q * .0010000000474974513 + 1.0);
		q = +Ug(p, r, c[l >> 2] | 0);
		g[e + 868 >> 2] = +g[r >> 2] / (q > 1.0 ? q : 1.0);
		vg(o, p, c[l >> 2] | 0);
		dg(o, c[l >> 2] | 0, .9900000095367432);
		Tf(f, o, h + (0 - m << 2) | 0, n + m | 0, c[l >> 2] | 0);
		h = d + 4797 | 0;
		if ((a[h >> 0] | 0) != 0 ? (c[d + 4696 >> 2] | 0) == 0 : 0) if (!(Cg(f, e + 228 | 0, d + 4794 | 0, d + 4796 | 0, d + 12236 | 0, c[d + 4568 >> 2] | 0, +(c[d + 4676 >> 2] | 0) * 152587890625.0e-16, .6000000238418579 - +(c[l >> 2] | 0) * .004000000189989805 - +(c[d + 4556 >> 2] | 0) * .10000000149011612 * .00390625 - +(a[d + 4565 >> 0] >> 1 | 0) * .15000000596046448 - +(c[d + 4744 >> 2] | 0) * .10000000149011612 * 30517578125.0e-15, c[d + 4600 >> 2] | 0, c[d + 4668 >> 2] | 0, c[d + 4604 >> 2] | 0, j) | 0)) {
			a[h >> 0] = 2;
			i = k;
			return
		} else {
			a[h >> 0] = 1;
			i = k;
			return
		}
		v = e + 228 | 0;
		c[v + 0 >> 2] = 0;
		c[v + 4 >> 2] = 0;
		c[v + 8 >> 2] = 0;
		c[v + 12 >> 2] = 0;
		b[d + 4794 >> 1] = 0;
		a[d + 4796 >> 0] = 0;
		g[d + 12236 >> 2] = 0.0;
		i = k;
		return
	}
	function tg(d, e, f, h, j) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0,
			v = 0,
			w = 0;
		k = i;
		i = i + 2e3 | 0;
		r = k + 1568 | 0;
		o = k + 1552 | 0;
		q = k + 1536 | 0;
		l = k + 1968 | 0;
		m = k;
		n = d + 4604 | 0;
		p = c[n >> 2] | 0;
		s = 0;
		while (1) {
			if ((s | 0) >= (p | 0)) break;
			t = 1.0 / +g[e + (s << 2) >> 2];
			g[o + (s << 2) >> 2] = t;
			g[q + (s << 2) >> 2] = t * t;
			s = s + 1 | 0
		}
		if ((a[d + 4797 >> 0] | 0) == 2) {
			w = e + 144 | 0;
			v = e + 228 | 0;
			u = d + 4612 | 0;
			qg(w, r, e + 872 | 0, f, v, q, c[u >> 2] | 0, p, c[d + 4616 >> 2] | 0);
			eh(w, d + 4772 | 0, d + 4800 | 0, d + 4688 | 0, r, c[d + 4684 >> 2] | 0, c[d + 4680 >> 2] | 0, c[n >> 2] | 0, c[d + 5124 >> 2] | 0);
			$f(d, e, j);
			s = c[d + 4664 >> 2] | 0;
			_f(m, h + (0 - s << 2) | 0, w, v, o, c[u >> 2] | 0, c[n >> 2] | 0, s)
		} else {
			f = d + 4664 | 0;
			w = c[f >> 2] | 0;
			q = d + 4612 | 0;
			s = w;
			r = 0;
			j = m;
			h = h + (0 - w << 2) | 0;
			while (1) {
				if ((r | 0) >= (p | 0)) break;
				Sg(j, h, +g[o + (r << 2) >> 2], (c[q >> 2] | 0) + s | 0);
				w = c[q >> 2] | 0;
				v = c[f >> 2] | 0;
				p = c[n >> 2] | 0;
				s = v;
				r = r + 1 | 0;
				j = j + (w + v << 2) | 0;
				h = h + (w << 2) | 0
			}
			wj(e + 144 | 0, 0, p * 20 | 0) | 0;
			g[e + 872 >> 2] = 0.0;
			c[d + 4688 >> 2] = 0
		}
		if (c[d + 4696 >> 2] | 0) {
			t = .009999999776482582;
			pg(d, l, m, t);
			u = e + 16 | 0;
			s = d + 4524 | 0;
			ch(d, u, l, s);
			s = e + 876 | 0;
			v = d + 4612 | 0;
			v = c[v >> 2] | 0;
			w = c[n >> 2] | 0;
			n = d + 4664 | 0;
			n = c[n >> 2] | 0;
			Rg(s, m, u, e, v, w, n);
			m = d + 4524 | 0;
			m = m + 0 | 0;
			n = l + 0 | 0;
			l = m + 32 | 0;
			do {
				b[m >> 1] = b[n >> 1] | 0;
				m = m + 2 | 0;
				n = n + 2 | 0
			} while ((m | 0) < (l | 0));
			i = k;
			return
		}
		t = +pa(+(+g[e + 872 >> 2] / 3.0)) / 1.0e4;
		t = t / (+g[e + 860 >> 2] * .75 + .25);
		pg(d, l, m, t);
		u = e + 16 | 0;
		s = d + 4524 | 0;
		ch(d, u, l, s);
		s = e + 876 | 0;
		v = d + 4612 | 0;
		v = c[v >> 2] | 0;
		w = c[n >> 2] | 0;
		n = d + 4664 | 0;
		n = c[n >> 2] | 0;
		Rg(s, m, u, e, v, w, n);
		m = d + 4524 | 0;
		m = m + 0 | 0;
		n = l + 0 | 0;
		l = m + 32 | 0;
		do {
			b[m >> 1] = b[n >> 1] | 0;
			m = m + 2 | 0;
			n = n + 2 | 0
		} while ((m | 0) < (l | 0));
		i = k;
		return
	}
	function ug(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0.0;
		d = i;
		h = c & 65532;
		e = 0.0;
		f = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) break;
			l = f | 1;
			k = f | 2;
			j = f | 3;
			e = e + (+g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2] + +g[a + (l << 2) >> 2] * +g[b + (l << 2) >> 2] + +g[a + (k << 2) >> 2] * +g[b + (k << 2) >> 2] + +g[a + (j << 2) >> 2] * +g[b + (j << 2) >> 2]);
			f = f + 4 | 0
		}
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			m = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = m
		}
		i = d;
		return +e
	}
	function vg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0;
		e = i;
		i = i + 64 | 0;
		d = e;
		f = 0;
		while (1) {
			if ((f | 0) < (c | 0)) h = 0;
			else break;
			while (1) {
				if ((h | 0) >= (f | 0)) break;
				g[d + (h << 2) >> 2] = +g[a + (h << 2) >> 2];
				h = h + 1 | 0
			}
			h = b + (f << 2) | 0;
			j = 0;
			while (1) {
				if ((j | 0) >= (f | 0)) break;
				k = a + (j << 2) | 0;
				g[k >> 2] = +g[k >> 2] + +g[d + (f - j + -1 << 2) >> 2] * +g[h >> 2];
				j = j + 1 | 0
			}
			g[a + (f << 2) >> 2] = -+g[h >> 2];
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function wg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0.0,
			e = 0,
			f = 0,
			h = 0,
			j = 0.0,
			k = 0.0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		e = i;
		l = +g[b >> 2];
		d = l * 9.999999960041972e-13 + 9.999999717180685e-10;
		l = d > l ? d : l;
		n = b + 4 | 0;
		k = +g[n >> 2] / l;
		g[a >> 2] = k;
		k = l - k * +g[n >> 2];
		if (d > k) {
			k = d;
			h = 1
		} else h = 1;
		while (1) {
			if ((h | 0) >= (c | 0)) break;
			f = h + 1 | 0;
			m = 0;
			l = +g[b + (f << 2) >> 2];
			while (1) {
				if ((m | 0) >= (h | 0)) break;
				j = l - +g[a + (m << 2) >> 2] * +g[b + (h - m << 2) >> 2];
				m = m + 1 | 0;
				l = j
			}
			j = l / k;
			k = k - j * l;
			k = d > k ? d : k;
			m = h >> 1;
			n = 0;
			while (1) {
				if ((n | 0) >= (m | 0)) break;
				o = a + (n << 2) | 0;
				p = a + (h - n + -1 << 2) | 0;
				l = +g[p >> 2];
				g[p >> 2] = l - j * +g[o >> 2];
				g[o >> 2] = +g[o >> 2] - j * l;
				n = n + 1 | 0
			}
			if (h & 1) {
				p = a + (m << 2) | 0;
				l = +g[p >> 2];
				g[p >> 2] = l - j * l
			}
			g[a + (h << 2) >> 2] = j;
			h = f
		}
		i = e;
		return +k
	}



	function xg(b, d, e, f) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0.0,
			z = 0,
			A = 0,
			B = 0,
			C = 0.0;
		h = i;
		i = i + 1040 | 0;
		n = h + 72 | 0;
		m = h;
		o = f + (0 - (c[b + 4624 >> 2] | 0) << 2) | 0;
		p = b + 4748 | 0;
		s = +(c[p >> 2] | 0) * .0078125;
		l = b + 4728 | 0;
		q = +((c[l >> 2] | 0) + (c[b + 4732 >> 2] | 0) | 0) * .5 * 30517578125.0e-15;
		j = d + 856 | 0;
		g[j >> 2] = q;
		r = +yg((s + -20.0) * .25);
		k = d + 860 | 0;
		g[k >> 2] = r;
		if (!(c[b + 4708 >> 2] | 0)) {
			C = 1.0 - +(c[b + 4556 >> 2] | 0) * .00390625;
			r = s - r * 2.0 * (q * .5 + .5) * C * C
		} else r = s;
		f = b + 4797 | 0;
		if ((a[f >> 0] | 0) == 2) {
			q = r + +g[b + 12236 >> 2] * 2.0;
			a[b + 4798 >> 0] = 0;
			g[d + 864 >> 2] = 0.0
		} else {
			q = r + (+(c[p >> 2] | 0) * -.4000000059604645 * .0078125 + 6.0) * (1.0 - q);
			t = c[b + 4600 >> 2] << 1;
			p = b + 4604 | 0;
			r = +(t | 0);
			s = 0.0;
			C = 0.0;
			u = 0;
			while (1) {
				if ((u | 0) >= (((c[p >> 2] << 16 >> 16) * 5 | 0) / 2 | 0 | 0)) break;
				y = +zg(r + +og(e, t));
				if ((u | 0) > 0) s = s + +O(+(y - C));
				C = y;
				e = e + (t << 2) | 0;
				u = u + 1 | 0
			}
			C = +yg((s + -5.0) * .4000000059604645);
			e = d + 864 | 0;
			g[e >> 2] = C;
			p = b + 4798 | 0;
			if (C > .75) a[p >> 0] = 0;
			else a[p >> 0] = 1;
			q = q + (+g[e >> 2] + -.5) * 2.0
		}
		C = +g[d + 868 >> 2] * .0010000000474974513;
		C = .949999988079071 / (C * C + 1.0);
		y = +g[k >> 2];
		r = (1.0 - y * .75) * .009999999776482582;
		s = C + r;
		r = (C - r) / s;
		t = b + 4704 | 0;
		e = c[t >> 2] | 0;
		if ((e | 0) > 0) y = +(e | 0) * 152587890625.0e-16 + y * .009999999776482582;
		else y = 0.0;
		e = b + 4604 | 0;
		p = b + 4600 | 0;
		x = b + 4628 | 0;
		w = b + 4612 | 0;
		u = b + 4660 | 0;
		v = 0;
		while (1) {
			z = c[e >> 2] | 0;
			if ((v | 0) >= (z | 0)) break;
			B = c[p >> 2] | 0;
			z = B * 3 | 0;
			A = ((c[x >> 2] | 0) - z | 0) / 2 | 0;
			ag(n, o, 1, A);
			yj(n + (A << 2) | 0, o + (A << 2) | 0, B * 12 | 0) | 0;
			z = A + z | 0;
			ag(n + (z << 2) | 0, o + (z << 2) | 0, 2, A);
			o = o + (c[w >> 2] << 2) | 0;
			A = c[x >> 2] | 0;
			z = c[u >> 2] | 0;
			if ((c[t >> 2] | 0) > 0) _g(m, n, y, A, z);
			else bg(m, n, A, z + 1 | 0);
			C = +g[m >> 2];
			g[m >> 2] = C + C * 4999999873689376.0e-20;
			A = v << 4;
			B = d + (A << 2) + 500 | 0;
			C = +P(+(+wg(B, m, c[u >> 2] | 0)));
			z = d + (v << 2) | 0;
			g[z >> 2] = C;
			if ((c[t >> 2] | 0) > 0) g[z >> 2] = C * +Ag(B, y, c[u >> 2] | 0);
			dg(B, c[u >> 2] | 0, s);
			A = d + (A << 2) + 244 | 0;
			yj(A | 0, B | 0, c[u >> 2] << 2 | 0) | 0;
			dg(A, c[u >> 2] | 0, r);
			C = +Zf(B, c[u >> 2] | 0);
			g[d + (v << 2) + 788 >> 2] = 1.0 - (1.0 - C / +Zf(A, c[u >> 2] | 0)) * .699999988079071;
			Bg(B, A, y, c[u >> 2] | 0);
			v = v + 1 | 0
		}
		q = +pa(+(q * -.1599999964237213));
		m = 0;
		while (1) {
			if ((m | 0) >= (z | 0)) break;
			z = d + (m << 2) | 0;
			g[z >> 2] = +g[z >> 2] * q + 1.2483305931091309;
			z = c[e >> 2] | 0;
			m = m + 1 | 0
		}
		q = +g[k >> 2] * .10000000149011612 + 1.0499999523162842;
		m = 0;
		while (1) {
			if ((m | 0) >= (z | 0)) break;
			z = d + (m << 2) + 788 | 0;
			g[z >> 2] = +g[z >> 2] * q;
			z = c[e >> 2] | 0;
			m = m + 1 | 0
		}
		m = b + 4556 | 0;
		q = ((+(c[l >> 2] | 0) * 30517578125.0e-15 + -1.0) * .5 + 1.0) * 4.0 * +(c[m >> 2] | 0) * .00390625;
		a: do
		if ((a[f >> 0] | 0) == 2) {
			l = 0;
			while (1) {
				if ((l | 0) >= (z | 0)) break;
				C = .20000000298023224 / +(c[p >> 2] | 0) + 3.0 / +(c[d + (l << 2) + 228 >> 2] | 0);
				g[d + (l << 2) + 756 >> 2] = C + -1.0;
				g[d + (l << 2) + 772 >> 2] = 1.0 - C - C * q;
				z = c[e >> 2] | 0;
				l = l + 1 | 0
			}
			q = -.25 - +(c[m >> 2] | 0) * .26249998807907104 * .00390625
		} else {
			C = 1.2999999523162842 / +(c[p >> 2] | 0);
			l = d + 756 | 0;
			g[l >> 2] = C + -1.0;
			m = d + 772 | 0;
			g[m >> 2] = 1.0 - C - C * q * .6000000238418579;
			n = 1;
			while (1) {
				z = c[e >> 2] | 0;
				if ((n | 0) >= (z | 0)) {
					q = -.25;
					break a
				}
				g[d + (n << 2) + 756 >> 2] = +g[l >> 2];
				g[d + (n << 2) + 772 >> 2] = +g[m >> 2];
				n = n + 1 | 0
			}
		}
		while (0);
		s = 1.0 - +g[k >> 2];
		y = +g[b + 12236 >> 2];
		C = +g[j >> 2];
		r = s * .10000000149011612 * y + (1.0 - C) * .10000000149011612;
		if ((a[f >> 0] | 0) == 2) s = ((1.0 - s * C) * .20000000298023224 + .30000001192092896) * +P(+y);
		else s = 0.0;
		j = b + 7204 | 0;
		f = b + 7208 | 0;
		b = b + 7212 | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (z | 0)) break;
			C = +g[j >> 2];
			C = C + (r - C) * .4000000059604645;
			g[j >> 2] = C;
			g[d + (k << 2) + 804 >> 2] = C;
			C = +g[f >> 2];
			C = C + (s - C) * .4000000059604645;
			g[f >> 2] = C;
			g[d + (k << 2) + 836 >> 2] = C;
			C = +g[b >> 2];
			C = C + (q - C) * .4000000059604645;
			g[b >> 2] = C;
			g[d + (k << 2) + 820 >> 2] = C;
			z = c[e >> 2] | 0;
			k = k + 1 | 0
		}
		i = h;
		return
	}
	function yg(a) {
		a = +a;
		a = 1.0 / (+Y(+-a) + 1.0);
		return +a
	}
	function zg(a) {
		a = +a;
		var b = 0;
		b = i;
		a = +la(+a) * 3.32192809488736;
		i = b;
		return +a
	}
	function Ag(a, b, c) {
		a = a | 0;
		b = +b;
		c = c | 0;
		var d = 0,
			e = 0.0;
		d = i;
		b = -b;
		e = +g[a + (c + -1 << 2) >> 2];
		c = c + -2 | 0;
		while (1) {
			e = e * b;
			if ((c | 0) <= -1) break;
			e = e + +g[a + (c << 2) >> 2];
			c = c + -1 | 0
		}
		i = d;
		return +(1.0 / (1.0 - e))
	}
	function Bg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0.0,
			r = 0,
			s = 0;
		e = i;
		j = d;
		while (1) {
			h = j + -1 | 0;
			if ((h | 0) <= 0) break;
			o = j + -2 | 0;
			n = a + (o << 2) | 0;
			g[n >> 2] = +g[n >> 2] - +g[a + (h << 2) >> 2] * c;
			o = b + (o << 2) | 0;
			g[o >> 2] = +g[o >> 2] - +g[b + (h << 2) >> 2] * c;
			j = h
		}
		f = 1.0 - c * c;
		m = f / (+g[a >> 2] * c + 1.0);
		k = f / (+g[b >> 2] * c + 1.0);
		h = 0;
		while (1) {
			if ((h | 0) >= (d | 0)) {
				j = 0;
				h = 0;
				break
			}
			o = a + (h << 2) | 0;
			g[o >> 2] = +g[o >> 2] * m;
			o = b + (h << 2) | 0;
			g[o >> 2] = +g[o >> 2] * k;
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) < 10) {
				l = -1.0;
				n = 0
			} else {
				a = 23;
				break
			}
			while (1) {
				if ((n | 0) >= (d | 0)) break;
				q = +O(+(+g[a + (n << 2) >> 2]));
				p = +O(+(+g[b + (n << 2) >> 2]));
				p = q > p ? q : p;
				o = p > l;
				j = o ? n : j;
				l = o ? p : l;
				n = n + 1 | 0
			}
			if (!(l <= 3.999000072479248)) n = 1;
			else {
				a = 23;
				break
			}
			while (1) {
				if ((n | 0) >= (d | 0)) break;
				o = n + -1 | 0;
				r = a + (o << 2) | 0;
				g[r >> 2] = +g[r >> 2] + +g[a + (n << 2) >> 2] * c;
				o = b + (o << 2) | 0;
				g[o >> 2] = +g[o >> 2] + +g[b + (n << 2) >> 2] * c;
				n = n + 1 | 0
			}
			m = 1.0 / m;
			k = 1.0 / k;
			n = 0;
			while (1) {
				if ((n | 0) >= (d | 0)) break;
				r = a + (n << 2) | 0;
				g[r >> 2] = +g[r >> 2] * m;
				r = b + (n << 2) | 0;
				g[r >> 2] = +g[r >> 2] * k;
				n = n + 1 | 0
			}
			q = .9900000095367432 - (+(h | 0) * .10000000149011612 + .800000011920929) * (l + -3.999000072479248) / (l * +(j + 1 | 0));
			dg(a, d, q);
			dg(b, d, q);
			n = d;
			while (1) {
				o = n + -1 | 0;
				if ((o | 0) <= 0) break;
				r = n + -2 | 0;
				s = a + (r << 2) | 0;
				g[s >> 2] = +g[s >> 2] - +g[a + (o << 2) >> 2] * c;
				r = b + (r << 2) | 0;
				g[r >> 2] = +g[r >> 2] - +g[b + (o << 2) >> 2] * c;
				n = o
			}
			m = f / (+g[a >> 2] * c + 1.0);
			k = f / (+g[b >> 2] * c + 1.0);
			n = 0;
			while (1) {
				if ((n | 0) >= (d | 0)) break;
				s = a + (n << 2) | 0;
				g[s >> 2] = +g[s >> 2] * m;
				s = b + (n << 2) | 0;
				g[s >> 2] = +g[s >> 2] * k;
				n = n + 1 | 0
			}
			h = h + 1 | 0
		}
		if ((a | 0) == 23) {
			i = e;
			return
		}
	}
	function Cg(d, f, h, j, k, l, m, n, o, p, q, r) {
		d = d | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = +m;
		n = +n;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		var s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0.0,
			J = 0.0,
			K = 0,
			L = 0,
			M = 0.0,
			N = 0.0,
			O = 0,
			P = 0,
			Q = 0.0,
			R = 0.0,
			S = 0,
			T = 0.0,
			U = 0,
			V = 0,
			W = 0;
		s = i;
		i = i + 13680 | 0;
		F = s + 8888 | 0;
		G = s + 8248 | 0;
		P = s + 13032 | 0;
		K = s + 12712 | 0;
		H = s;
		B = s + 5864 | 0;
		E = s + 5604 | 0;
		A = s + 5560 | 0;
		z = s + 5464 | 0;
		C = s + 12408 | 0;
		v = s + 2744 | 0;
		w = s + 24 | 0;
		S = s + 11128 | 0;
		U = s + 10168 | 0;
		V = $((q * 5 | 0) + 20 | 0, o) | 0;
		L = (q * 20 | 0) + 80 | 0;
		O = (q * 40 | 0) + 160 | 0;
		y = o * 5 | 0;
		t = o << 1;
		u = o * 18 | 0;
		x = u + -1 | 0;
		D = (o | 0) == 16;
		do
		if (!D) if ((o | 0) == 12) {
			Dg(U, d, V);
			c[H + 0 >> 2] = 0;
			c[H + 4 >> 2] = 0;
			c[H + 8 >> 2] = 0;
			c[H + 12 >> 2] = 0;
			c[H + 16 >> 2] = 0;
			c[H + 20 >> 2] = 0;
			yh(H, P, U, V);
			Eg(F, P, O);
			S = H;
			break
		} else {
			Dg(P, d, O);
			S = H;
			break
		} else {
			Dg(S, d, V);
			U = H;
			c[U >> 2] = 0;
			c[U + 4 >> 2] = 0;
			xh(H, P, S, V);
			Eg(F, P, O);
			S = H
		}
		while (0);
		V = H;
		c[V >> 2] = 0;
		c[V + 4 >> 2] = 0;
		xh(S, K, P, O);
		Eg(G, K, L);
		while (1) {
			H = L + -1 | 0;
			if ((H | 0) <= 0) break;
			V = G + (H << 2) | 0;
			g[V >> 2] = +g[V >> 2] + +g[G + (L + -2 << 2) >> 2];
			L = H
		}
		wj(B | 0, 0, q * 596 | 0) | 0;
		K = q >> 1;
		O = E + 256 | 0;
		H = B + 32 | 0;
		L = 0;
		U = G + 320 | 0;
		while (1) {
			if ((L | 0) >= (K | 0)) {
				E = 72;
				break
			}
			G = U + -32 | 0;
			_c(U, U + -288 | 0, E, 40, 65, r);
			T = +g[O >> 2];
			I = +og(U, 40);
			I = I + +og(G, 40) + 16.0e4;
			g[H >> 2] = +g[H >> 2] + T * 2.0 / I;
			P = 8;
			while (1) {
				S = P + 1 | 0;
				if ((P | 0) >= 72) break;
				V = G + -4 | 0;
				R = +g[V >> 2];
				T = +g[G + 156 >> 2];
				T = I + (R * R - T * T);
				W = B + (S << 2) | 0;
				g[W >> 2] = +g[W >> 2] + +g[E + (71 - P << 2) >> 2] * 2.0 / T;
				G = V;
				I = T;
				P = S
			}
			L = L + 1 | 0;
			U = U + 160 | 0
		}
		while (1) {
			if ((E | 0) < 8) break;
			W = B + (E << 2) | 0;
			T = +g[W >> 2];
			g[W >> 2] = T - T * +(E | 0) * .000244140625;
			E = E + -1 | 0
		}
		E = (p << 1) + 4 | 0;
		Zg(H, z, 65, E);
		I = +g[H >> 2];
		if (I < .20000000298023224) {
			wj(f | 0, 0, q << 2 | 0) | 0;
			g[k >> 2] = 0.0;
			b[h >> 1] = 0;
			a[j >> 0] = 0;
			W = 1;
			i = s;
			return W | 0
		}
		m = I * m;
		G = 0;
		while (1) {
			if ((G | 0) >= (E | 0)) break;
			if (!(+g[B + (G + 8 << 2) >> 2] > m)) {
				E = G;
				break
			}
			W = z + (G << 2) | 0;
			c[W >> 2] = (c[W >> 2] << 1) + 16;
			G = G + 1 | 0
		}
		G = 11;
		while (1) {
			if ((G | 0) >= 148) {
				G = 0;
				break
			}
			b[C + (G << 1) >> 1] = 0;
			G = G + 1 | 0
		}
		while (1) {
			if ((G | 0) >= (E | 0)) {
				E = 146;
				break
			}
			b[C + (c[z + (G << 2) >> 2] << 1) >> 1] = 1;
			G = G + 1 | 0
		}
		while (1) {
			if ((E | 0) < 16) {
				E = 0;
				G = 16;
				break
			}
			W = E + -1 | 0;
			V = C + (E << 1) | 0;
			b[V >> 1] = (e[V >> 1] | 0) + ((e[C + (W << 1) >> 1] | 0) + (e[C + (E + -2 << 1) >> 1] | 0));
			E = W
		}
		while (1) {
			if ((G | 0) >= 144) {
				G = 146;
				break
			}
			H = G + 1 | 0;
			if ((b[C + (H << 1) >> 1] | 0) <= 0) {
				G = H;
				continue
			}
			c[z + (E << 2) >> 2] = G;
			E = E + 1 | 0;
			G = H
		}
		while (1) {
			if ((G | 0) < 16) {
				H = 0;
				G = 16;
				break
			}
			W = G + -1 | 0;
			V = C + (G << 1) | 0;
			b[V >> 1] = (e[V >> 1] | 0) + ((e[C + (W << 1) >> 1] | 0) + (e[C + (G + -2 << 1) >> 1] | 0) + (e[C + (G + -3 << 1) >> 1] | 0));
			G = W
		}
		while (1) {
			if ((G | 0) >= 147) break;
			if ((b[C + (G << 1) >> 1] | 0) > 0) {
				b[C + (H << 1) >> 1] = G + 65534;
				H = H + 1 | 0
			}
			G = G + 1 | 0
		}
		wj(B | 0, 0, 2384) | 0;
		G = (o | 0) == 8;
		if (G) {
			K = 0;
			P = d + 640 | 0
		} else {
			K = 0;
			P = F + 640 | 0
		}
		while (1) {
			if ((K | 0) >= (q | 0)) break;
			m = +og(P, 40) + 1.0;
			F = 0;
			while (1) {
				if ((F | 0) >= (H | 0)) break;
				L = b[C + (F << 1) >> 1] | 0;
				O = P + (0 - L << 2) | 0;
				I = +ug(O, P, 40);
				if (I > 0.0) g[B + (K * 596 | 0) + (L << 2) >> 2] = I * 2.0 / (+og(O, 40) + m);
				else g[B + (K * 596 | 0) + (L << 2) >> 2] = 0.0;
				F = F + 1 | 0
			}
			K = K + 1 | 0;
			P = P + 160 | 0
		}
		if ((l | 0) > 0) {
			if ((o | 0) == 12) C = (l << 1 | 0) / 3 | 0;
			else C = D ? l >> 1 : l;
			l = C;
			m = +Fg(+(C | 0))
		} else m = 0.0;
		C = (q | 0) == 4;
		if (C) {
			D = 21304;
			F = 11;
			H = G & (p | 0) > 0 ? 11 : 3
		} else {
			D = 21264;
			F = 3;
			H = 3
		}
		J = +(q | 0);
		I = J * .20000000298023224;
		K = (l | 0) > 0;
		M = J * n;
		G = 0;
		N = 0.0;
		n = -1.0e3;
		l = -1;
		L = 0;
		while (1) {
			if ((L | 0) >= (E | 0)) break;
			O = c[z + (L << 2) >> 2] | 0;
			U = 0;
			while (1) {
				if ((U | 0) >= (H | 0)) {
					P = 0;
					Q = -1.0e3;
					S = 0;
					break
				}
				S = A + (U << 2) | 0;
				g[S >> 2] = 0.0;
				Q = 0.0;
				P = 0;
				while (1) {
					if ((P | 0) >= (q | 0)) break;
					T = Q + +g[B + (P * 596 | 0) + (O + (a[D + (($(P, F) | 0) + U) >> 0] | 0) << 2) >> 2];
					g[S >> 2] = T;
					Q = T;
					P = P + 1 | 0
				}
				U = U + 1 | 0
			}
			while (1) {
				if ((S | 0) >= (H | 0)) break;
				T = +g[A + (S << 2) >> 2];
				W = T > Q;
				P = W ? S : P;
				Q = W ? T : Q;
				S = S + 1 | 0
			}
			T = +Fg(+(O | 0));
			R = Q - I * T;
			if (K) {
				T = T - m;
				T = T * T;
				R = R - I * +g[k >> 2] * T / (T + .5)
			}
			W = R > n & Q > M;
			G = W ? P : G;
			N = W ? Q : N;
			n = W ? R : n;
			l = W ? O : l;
			L = L + 1 | 0
		}
		if ((l | 0) == -1) {
			c[f + 0 >> 2] = 0;
			c[f + 4 >> 2] = 0;
			c[f + 8 >> 2] = 0;
			c[f + 12 >> 2] = 0;
			g[k >> 2] = 0.0;
			b[h >> 1] = 0;
			a[j >> 0] = 0;
			W = 1;
			i = s;
			return W | 0
		}
		g[k >> 2] = N / J;
		if ((o | 0) > 8) {
			if ((o | 0) == 12) {
				z = (l << 16 >> 16) * 3 | 0;
				z = (z >> 1) + (z & 1) | 0
			} else z = l << 1;
			if ((t | 0) > (x | 0)) if ((z | 0) > (t | 0)) B = t;
			else B = (z | 0) < (x | 0) ? x : z;
			else if ((z | 0) > (x | 0)) B = x;
			else B = (z | 0) < (t | 0) ? t : z;
			k = Gg(B + -2 | 0, t) | 0;
			A = Hg(B + 2 | 0, x) | 0;
			Ig(w, d, k, y, q, p, r);
			Jg(v, d, k, y, q, p);
			n = .05000000074505806 / +(B | 0);
			if (C) {
				r = 21352;
				z = 34;
				p = a[21512 + p >> 0] | 0
			} else {
				r = 21272;
				z = 12;
				p = 12
			}
			m = +og(d + (o * 20 << 2) | 0, $(y, q) | 0) + 1.0;
			G = 0;
			I = -1.0e3;
			o = 0;
			d = B;
			y = k;
			while (1) {
				if ((y | 0) > (A | 0)) break;
				else k = 0;
				while (1) {
					if ((k | 0) < (p | 0)) {
						M = 0.0;
						J = m;
						B = 0
					} else break;
					while (1) {
						if ((B | 0) >= (q | 0)) break;
						M = M + +g[w + (B * 680 | 0) + (k * 20 | 0) + (o << 2) >> 2];
						J = J + +g[v + (B * 680 | 0) + (k * 20 | 0) + (o << 2) >> 2];
						B = B + 1 | 0
					}
					if (M > 0.0) J = M * 2.0 / J * (1.0 - n * +(k | 0));
					else J = 0.0;
					if (J > I) {
						W = (y + (a[21352 + k >> 0] | 0) | 0) > (x | 0);
						G = W ? G : k;
						I = W ? I : J;
						d = W ? d : y
					}
					k = k + 1 | 0
				}
				o = o + 1 | 0;
				y = y + 1 | 0
			}
			x = (t | 0) > (u | 0);
			w = 0;
			while (1) {
				if ((w | 0) >= (q | 0)) break;
				o = d + (a[r + (($(w, z) | 0) + G) >> 0] | 0) | 0;
				v = f + (w << 2) | 0;
				c[v >> 2] = o;
				if (x) if ((o | 0) > (t | 0)) o = t;
				else o = (o | 0) < (u | 0) ? u : o;
				else if ((o | 0) > (u | 0)) o = u;
				else o = (o | 0) < (t | 0) ? t : o;
				c[v >> 2] = o;
				w = w + 1 | 0
			}
			f = d - t | 0
		} else {
			t = 0;
			while (1) {
				if ((t | 0) >= (q | 0)) break;
				v = l + (a[D + (($(t, F) | 0) + G) >> 0] | 0) | 0;
				u = f + (t << 2) | 0;
				c[u >> 2] = v;
				if ((v | 0) > 144) v = 144;
				else v = (v | 0) < 16 ? 16 : v;
				c[u >> 2] = v;
				t = t + 1 | 0
			}
			f = l + 65520 | 0
		}
		b[h >> 1] = f;
		a[j >> 0] = G;
		W = 0;
		i = s;
		return W | 0
	}
	function Dg(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			d = c + (f << 2) | 0;
			if ((sa(+(+g[d >> 2])) | 0) <= 32767) if ((sa(+(+g[d >> 2])) | 0) < -32768) d = -32768;
			else d = (sa(+(+g[d >> 2])) | 0) & 65535;
			else d = 32767;
			b[a + (f << 1) >> 1] = d;
			d = f
		}
		i = e;
		return
	}
	function Eg(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			g[a + (f << 2) >> 2] = +(b[c + (f << 1) >> 1] | 0);
			d = f
		}
		i = e;
		return
	}
	function Fg(a) {
		a = +a;
		var b = 0;
		b = i;
		a = +la(+a) * 3.32192809488736;
		i = b;
		return +a
	}
	function Gg(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function Hg(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) < (b | 0) ? a : b) | 0
	}
	function Ig(b, c, d, e, f, h, j) {
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0;
		o = i;
		i = i + 176 | 0;
		m = o + 88 | 0;
		l = o;
		if ((f | 0) == 4) {
			n = 21352;
			k = 21488 + (h << 3) | 0;
			p = 34;
			h = a[21512 + h >> 0] | 0
		} else {
			n = 21272;
			k = 21296;
			p = 12;
			h = 12
		}
		q = 0;
		c = c + (e << 2 << 2) | 0;
		while (1) {
			if ((q | 0) >= (f | 0)) break;
			u = q << 1;
			r = a[k + u >> 0] | 0;
			u = a[k + (u | 1) >> 0] | 0;
			_c(c, c + (0 - (u + d) << 2) | 0, l, e, u - r + 1 | 0, j);
			s = 0;
			t = r;
			while (1) {
				if ((t | 0) > (u | 0)) break;
				g[m + (s << 2) >> 2] = +g[l + (u - t << 2) >> 2];
				s = s + 1 | 0;
				t = t + 1 | 0
			}
			v = $(q, p) | 0;
			u = 0;
			while (1) {
				if ((u | 0) >= (h | 0)) break;
				s = (a[n + (v + u) >> 0] | 0) - r | 0;
				t = 0;
				while (1) {
					if ((t | 0) >= 5) break;
					g[b + (q * 680 | 0) + (u * 20 | 0) + (t << 2) >> 2] = +g[m + (s + t << 2) >> 2];
					t = t + 1 | 0
				}
				u = u + 1 | 0
			}
			q = q + 1 | 0;
			c = c + (e << 2) | 0
		}
		i = o;
		return
	}
	function Jg(b, c, d, e, f, h) {
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0,
			v = 0.0,
			w = 0.0;
		k = i;
		i = i + 96 | 0;
		j = k;
		if ((f | 0) == 4) {
			l = 21352;
			n = 21488 + (h << 3) | 0;
			m = 34;
			o = a[21512 + h >> 0] | 0
		} else {
			l = 21272;
			n = 21296;
			m = 12;
			o = 12
		}
		h = 0;
		c = c + (e << 2 << 2) | 0;
		while (1) {
			if ((h | 0) >= (f | 0)) break;
			r = h << 1;
			p = a[n + r >> 0] | 0;
			s = p + d | 0;
			t = +og(c + (0 - s << 2) | 0, e) + .001;
			g[j >> 2] = t;
			r = (a[n + (r | 1) >> 0] | 0) - p + 1 | 0;
			u = 1;
			q = 1;
			while (1) {
				if ((q | 0) >= (r | 0)) break;
				w = +g[c + (e - q - s << 2) >> 2];
				v = +g[c + (0 - (s + q) << 2) >> 2];
				v = t - w * w + v * v;
				g[j + (u << 2) >> 2] = v;
				t = v;
				u = u + 1 | 0;
				q = q + 1 | 0
			}
			s = $(h, m) | 0;
			u = 0;
			while (1) {
				if ((u | 0) >= (o | 0)) break;
				r = (a[l + (s + u) >> 0] | 0) - p | 0;
				q = 0;
				while (1) {
					if ((q | 0) >= 5) break;
					g[b + (h * 680 | 0) + (u * 20 | 0) + (q << 2) >> 2] = +g[j + (r + q << 2) >> 2];
					q = q + 1 | 0
				}
				u = u + 1 | 0
			}
			h = h + 1 | 0;
			c = c + (e << 2) | 0
		}
		i = k;
		return
	}
	function Kg(b, d, e, f) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0,
			C = 0.0,
			D = 0.0,
			E = 0.0;
		v = i;
		i = i + 400 | 0;
		p = v + 384 | 0;
		m = v;
		u = b + 7216 | 0;
		t = b + 4604 | 0;
		s = b + 4797 | 0;
		j = p + 4 | 0;
		k = p + 8 | 0;
		l = b + 9264 | 0;
		n = b + 4704 | 0;
		o = b + 4612 | 0;
		h = b + 4660 | 0;
		q = d + 860 | 0;
		r = b + 9344 | 0;
		B = c[b + 9352 >> 2] | 0;
		w = 0;
		while (1) {
			y = c[t >> 2] | 0;
			if ((w | 0) >= (y | 0)) break;
			if ((a[s >> 0] | 0) == 2) B = c[d + (w << 2) + 228 >> 2] | 0;
			A = d + (w << 2) + 804 | 0;
			z = +g[d + (w << 2) + 836 >> 2] * (1.0 - +g[A >> 2]);
			C = z * .25;
			g[p >> 2] = C;
			g[j >> 2] = z * .4999847412109375;
			g[k >> 2] = C;
			C = +g[d + (w << 2) + 820 >> 2];
			x = +g[d + (w << 2) + 756 >> 2];
			E = +g[d + (w << 2) + 772 >> 2];
			Lg(l, m, d + (w << 4 << 2) + 244 | 0, f, +(c[n >> 2] | 0) * 152587890625.0e-16, c[o >> 2] | 0, c[h >> 2] | 0);
			D = +g[d + (w << 2) + 788 >> 2];
			z = -(D * (+g[A >> 2] * z + .05000000074505806 + +g[q >> 2] * .10000000149011612));
			g[e >> 2] = D * +g[m >> 2] + +g[r >> 2] * z;
			A = 1;
			while (1) {
				y = c[o >> 2] | 0;
				if ((A | 0) >= (y | 0)) break;
				g[e + (A << 2) >> 2] = D * +g[m + (A << 2) >> 2] + +g[m + (A + -1 << 2) >> 2] * z;
				A = A + 1 | 0
			}
			g[r >> 2] = +g[m + (y + -1 << 2) >> 2];
			Mg(u, e, e, p, C, x, E, B, y);
			A = c[o >> 2] | 0;
			f = f + (A << 2) | 0;
			e = e + (A << 2) | 0;
			w = w + 1 | 0
		}
		c[b + 9352 >> 2] = c[d + (y + -1 << 2) + 228 >> 2];
		i = v;
		return
	}
	function Lg(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = +e;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0,
			r = 0.0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0,
			y = 0.0,
			z = 0;
		o = i;
		j = a + 4 | 0;
		k = a + 8 | 0;
		l = a + (h << 2) | 0;
		m = c + (h + -1 << 2) | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (f | 0)) break;
			v = +g[j >> 2];
			p = +g[a >> 2] + v * e;
			q = d + (n << 2) | 0;
			g[a >> 2] = +g[q >> 2];
			u = +g[k >> 2];
			g[j >> 2] = p;
			t = u;
			r = +g[c >> 2] * p;
			s = 2;
			p = v + (u - p) * e;
			while (1) {
				if ((s | 0) >= (h | 0)) break;
				z = a + ((s | 1) << 2) | 0;
				w = +g[z >> 2];
				v = t + (w - p) * e;
				g[a + (s << 2) >> 2] = p;
				y = r + +g[c + (s + -1 << 2) >> 2] * p;
				x = s + 2 | 0;
				u = +g[a + (x << 2) >> 2];
				g[z >> 2] = v;
				t = u;
				r = y + +g[c + (s << 2) >> 2] * v;
				s = x;
				p = w + (u - v) * e
			}
			g[l >> 2] = p;
			g[b + (n << 2) >> 2] = +g[q >> 2] - (r + +g[m >> 2] * p);
			n = n + 1 | 0
		}
		i = o;
		return
	}
	function Mg(a, b, d, e, f, h, j, k, l) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = +f;
		h = +h;
		j = +j;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0.0,
			y = 0,
			z = 0.0,
			A = 0.0;
		s = i;
		r = a + 2116 | 0;
		n = a + 2120 | 0;
		p = a + 2124 | 0;
		m = (k | 0) > 0;
		t = e + 4 | 0;
		u = e + 8 | 0;
		q = c[r >> 2] | 0;
		v = +g[n >> 2];
		o = +g[p >> 2];
		w = 0;
		while (1) {
			if ((w | 0) >= (l | 0)) break;
			if (m) {
				y = q + k | 0;
				x = +g[a + ((y + 510 & 511) << 2) >> 2] * +g[e >> 2] + +g[a + ((y + 511 & 511) << 2) >> 2] * +g[t >> 2] + +g[a + ((y & 511) << 2) >> 2] * +g[u >> 2]
			} else x = 0.0;
			A = +g[b + (w << 2) >> 2] - v * f;
			z = A - (v * j + o * h);
			y = q + 511 & 511;
			g[a + (y << 2) >> 2] = z;
			g[d + (w << 2) >> 2] = z - x;
			q = y;
			v = A;
			o = z;
			w = w + 1 | 0
		}
		g[n >> 2] = v;
		g[p >> 2] = o;
		c[r >> 2] = q;
		i = s;
		return
	}
	function Ng(d, e, f) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0.0;
		h = i;
		i = i + 16 | 0;
		k = h;
		j = d + 4797 | 0;
		a: do
		if ((a[j >> 0] | 0) == 2) {
			n = 1.0 - +Og((+g[e + 872 >> 2] + -12.0) * .25) * .5;
			l = d + 4604 | 0;
			m = 0;
			while (1) {
				if ((m | 0) >= (c[l >> 2] | 0)) break a;
				o = e + (m << 2) | 0;
				g[o >> 2] = +g[o >> 2] * n;
				m = m + 1 | 0
			}
		} else l = d + 4604 | 0;
		while (0);
		n = +pa(+((21.0 - +(c[d + 4748 >> 2] | 0) * .0078125) * .33000001311302185));
		n = n / +(c[d + 4612 >> 2] | 0);
		o = 0;
		while (1) {
			m = c[l >> 2] | 0;
			if ((o | 0) >= (m | 0)) {
				o = 0;
				break
			}
			m = e + (o << 2) | 0;
			p = +g[m >> 2];
			p = +P(+(p * p + +g[e + (o << 2) + 876 >> 2] * n));
			g[m >> 2] = p < 32767.0 ? p : 32767.0;
			o = o + 1 | 0
		}
		while (1) {
			if ((o | 0) >= (m | 0)) break;
			c[k + (o << 2) >> 2] = ~~ (+g[e + (o << 2) >> 2] * 65536.0);
			o = o + 1 | 0
		}
		yj(e + 892 | 0, k | 0, m << 2 | 0) | 0;
		o = d + 7200 | 0;
		a[e + 908 >> 0] = a[o >> 0] | 0;
		fh(d + 4768 | 0, k, o, (f | 0) == 2 & 1, c[l >> 2] | 0);
		f = 0;
		while (1) {
			if ((f | 0) >= (c[l >> 2] | 0)) break;
			g[e + (f << 2) >> 2] = +(c[k + (f << 2) >> 2] | 0) * 152587890625.0e-16;
			f = f + 1 | 0
		}
		j = a[j >> 0] | 0;
		do
		if (j << 24 >> 24 == 2) {
			k = d + 4798 | 0;
			if (+g[e + 872 >> 2] + +(c[d + 4744 >> 2] | 0) * 30517578125.0e-15 > 1.0) {
				a[k >> 0] = 0;
				k = 0;
				break
			} else {
				a[k >> 0] = 1;
				k = 1;
				break
			}
		} else k = a[d + 4798 >> 0] | 0;
		while (0);
		g[e + 852 >> 2] = +(c[d + 4652 >> 2] | 0) * -.05000000074505806 + 1.2000000476837158 + +(c[d + 4556 >> 2] | 0) * -.20000000298023224 * .00390625 + +g[e + 856 >> 2] * -.10000000149011612 + +g[e + 860 >> 2] * -.20000000298023224 + +(b[24968 + (j << 24 >> 24 >> 1 << 2) + (k << 24 >> 24 << 1) >> 1] | 0) * .0009765625 * .800000011920929;
		i = h;
		return
	}
	function Og(a) {
		a = +a;
		a = 1.0 / (+Y(+-a) + 1.0);
		return +a
	}
	function Pg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = +c;
		var d = 0,
			e = 0,
			f = 0;
		d = i;
		e = 0;
		while (1) {
			if ((e | 0) >= 5) break;
			f = a + (e * 6 << 2) | 0;
			g[f >> 2] = +g[f >> 2] + c;
			e = e + 1 | 0
		}
		g[b >> 2] = +g[b >> 2] + c;
		i = d;
		return
	}
	function Qg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = +d;
		var e = 0,
			f = 0,
			h = 0.0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0.0;
		e = i;
		j = 0.0;
		h = (+g[b >> 2] + +g[b + 96 >> 2]) * 9.99999993922529e-9;
		f = 0;
		while (1) {
			if ((f | 0) < 10) {
				k = 0;
				j = 0.0
			} else {
				c = 14;
				break
			}
			while (1) {
				if ((k | 0) >= 5) break;
				m = j + +g[c + (k << 2) >> 2] * +g[a + (k << 2) >> 2];
				k = k + 1 | 0;
				j = m
			}
			j = d - j * 2.0;
			n = 0;
			while (1) {
				if ((n | 0) < 5) {
					k = n;
					m = 0.0
				} else break;
				while (1) {
					l = k + 1 | 0;
					if ((l | 0) >= 5) break;
					k = l;
					m = m + +g[b + (n + (l * 5 | 0) << 2) >> 2] * +g[a + (l << 2) >> 2]
				}
				o = +g[a + (n << 2) >> 2];
				j = j + o * (m * 2.0 + +g[b + (n * 6 << 2) >> 2] * o);
				n = n + 1 | 0
			}
			if (j > 0.0) {
				c = 14;
				break
			} else k = 0;
			while (1) {
				if ((k | 0) >= 5) break;
				n = b + (k * 6 << 2) | 0;
				g[n >> 2] = +g[n >> 2] + h;
				k = k + 1 | 0
			}
			h = h * 2.0;
			f = f + 1 | 0
		}
		if ((c | 0) == 14) {
			i = e;
			return +((f | 0) == 10 ? 1.0 : j)
		}
		return 0.0
	}
	function Rg(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0;
		n = i;
		i = i + 768 | 0;
		j = n;
		l = j + (h << 2) | 0;
		m = h + e | 0;
		k = m << 1;
		Tf(j, c, b, k, h);
		o = +g[d >> 2];
		g[a >> 2] = o * o * +og(l, e);
		o = +g[d + 4 >> 2];
		m = j + (m + h << 2) | 0;
		g[a + 4 >> 2] = o * o * +og(m, e);
		if ((f | 0) != 4) {
			i = n;
			return
		}
		Tf(j, c + 64 | 0, b + (k << 2) | 0, k, h);
		o = +g[d + 8 >> 2];
		g[a + 8 >> 2] = o * o * +og(l, e);
		o = +g[d + 12 >> 2];
		g[a + 12 >> 2] = o * o * +og(m, e);
		i = n;
		return
	}
	function Sg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0;
		e = i;
		h = d & 65532;
		f = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) break;
			g[a + (f << 2) >> 2] = +g[b + (f << 2) >> 2] * c;
			j = f | 1;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * c;
			j = f | 2;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * c;
			j = f | 3;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * c;
			f = f + 4 | 0
		}
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g[a + (f << 2) >> 2] = +g[b + (f << 2) >> 2] * c;
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function Tg(a, b) {
		a = a | 0;
		b = +b;
		var c = 0,
			d = 0,
			e = 0;
		c = i;
		d = 0;
		while (1) {
			if ((d | 0) >= 24) break;
			e = a + (d << 2) | 0;
			g[e >> 2] = +g[e >> 2] * b;
			e = a + ((d | 1) << 2) | 0;
			g[e >> 2] = +g[e >> 2] * b;
			e = a + ((d | 2) << 2) | 0;
			g[e >> 2] = +g[e >> 2] * b;
			e = a + ((d | 3) << 2) | 0;
			g[e >> 2] = +g[e >> 2] * b;
			d = d + 4 | 0
		}
		while (1) {
			if ((d | 0) >= 25) break;
			e = a + (d << 2) | 0;
			g[e >> 2] = +g[e >> 2] * b;
			d = d + 1 | 0
		}
		i = c;
		return
	}
	function Ug(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0,
			o = 0.0,
			p = 0;
		e = i;
		i = i + 144 | 0;
		d = e;
		h = c + 1 | 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) break;
			j = +g[b + (f << 2) >> 2];
			g[d + (f << 3) + 4 >> 2] = j;
			g[d + (f << 3) >> 2] = j;
			f = f + 1 | 0
		}
		b = d + 4 | 0;
		k = 0;
		a: while (1) {
			if ((k | 0) >= (c | 0)) break;
			l = k + 1 | 0;
			j = +g[b >> 2];
			j = -+g[d + (l << 3) >> 2] / (j > 9.999999717180685e-10 ? j : 9.999999717180685e-10);
			g[a + (k << 2) >> 2] = j;
			f = c - k | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (f | 0)) {
					k = l;
					continue a
				}
				p = d + (h + k + 1 << 3) | 0;
				n = +g[p >> 2];
				m = d + (h << 3) + 4 | 0;
				o = +g[m >> 2];
				g[p >> 2] = n + o * j;
				g[m >> 2] = o + n * j;
				h = h + 1 | 0
			}
		}
		i = e;
		return +(+g[b >> 2])
	}
	function Vg(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0;
		f = i;
		i = i + 1152 | 0;
		d = f + 128 | 0;
		e = f + 64 | 0;
		h = f;
		Wg(a, 5, d, h);
		Xg(d, 5, b, e);
		b = 0;
		while (1) {
			if ((b | 0) >= 5) break;
			a = e + (b << 2) | 0;
			g[a >> 2] = +g[a >> 2] * +g[h + (b << 2) >> 2];
			b = b + 1 | 0
		}
		Yg(d, 5, e, c);
		i = f;
		return
	}
	function Wg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0,
			u = 0.0,
			v = 0.0;
		j = i;
		i = i + 128 | 0;
		h = j + 64 | 0;
		f = j;
		k = (+g[a >> 2] + +g[a + (($(b, b) | 0) + -1 << 2) >> 2]) * 4999999873689376.0e-21;
		m = 1;
		l = 0;
		a: while (1) {
			if ((l | 0) < (b | 0) & (m | 0) == 1) n = 0;
			else break;
			b: while (1) {
				if ((n | 0) >= (b | 0)) {
					e = 16;
					break
				}
				m = $(n, b) | 0;
				p = m + n | 0;
				o = 0;
				s = +g[a + (p << 2) >> 2];
				while (1) {
					if ((o | 0) >= (n | 0)) break;
					v = +g[c + (m + o << 2) >> 2];
					u = v * +g[f + (o << 2) >> 2];
					g[h + (o << 2) >> 2] = u;
					o = o + 1 | 0;
					s = s - v * u
				}
				if (s < k) break;
				g[f + (n << 2) >> 2] = s;
				o = d + (n << 2) | 0;
				g[o >> 2] = 1.0 / s;
				g[c + (p << 2) >> 2] = 1.0;
				p = n + 1 | 0;
				q = c + (($(p, b) | 0) << 2) | 0;
				t = n;
				while (1) {
					t = t + 1 | 0;
					if ((t | 0) < (b | 0)) {
						r = 0;
						s = 0.0
					} else {
						n = p;
						continue b
					}
					while (1) {
						if ((r | 0) >= (n | 0)) break;
						v = s + +g[q + (r << 2) >> 2] * +g[h + (r << 2) >> 2];
						r = r + 1 | 0;
						s = v
					}
					g[c + (($(t, b) | 0) + n << 2) >> 2] = (+g[a + (m + t << 2) >> 2] - s) * +g[o >> 2];
					q = q + (b << 2) | 0
				}
			}
			if ((e | 0) == 16) {
				e = 0;
				m = 0;
				l = l + 1 | 0;
				continue
			}
			l = l + 1 | 0;
			s = +(l | 0) * k - s;
			m = 0;
			while (1) {
				if ((m | 0) >= (b | 0)) {
					m = 1;
					continue a
				}
				t = a + (($(m, b) | 0) + m << 2) | 0;
				g[t >> 2] = +g[t >> 2] + s;
				m = m + 1 | 0
			}
		}
		i = j;
		return
	}
	function Xg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0.0,
			j = 0,
			k = 0,
			l = 0.0;
		e = i;
		f = 0;
		while (1) {
			if ((f | 0) >= (b | 0)) break;
			j = $(f, b) | 0;
			k = 0;
			h = 0.0;
			while (1) {
				if ((k | 0) >= (f | 0)) break;
				l = h + +g[a + (j + k << 2) >> 2] * +g[d + (k << 2) >> 2];
				k = k + 1 | 0;
				h = l
			}
			g[d + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - h;
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function Yg(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0.0,
			j = 0,
			k = 0,
			l = 0.0;
		e = i;
		j = b;
		while (1) {
			f = j + -1 | 0;
			if ((j | 0) > 0) {
				j = b;
				h = 0.0
			} else break;
			while (1) {
				k = j + -1 | 0;
				if ((k | 0) <= (f | 0)) break;
				l = +g[a + (f + ($(k, b) | 0) << 2) >> 2];
				j = k;
				h = h + l * +g[d + (k << 2) >> 2]
			}
			g[d + (f << 2) >> 2] = +g[c + (f << 2) >> 2] - h;
			j = f
		}
		i = e;
		return
	}
	function Zg(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0,
			m = 0.0,
			n = 0;
		f = i;
		h = 0;
		while (1) {
			if ((h | 0) >= (e | 0)) {
				h = 1;
				break
			}
			c[b + (h << 2) >> 2] = h;
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) >= (e | 0)) break;
			k = +g[a + (h << 2) >> 2];
			j = h;
			while (1) {
				l = j + -1 | 0;
				if ((j | 0) <= 0) break;
				m = +g[a + (l << 2) >> 2];
				if (!(k > m)) break;
				g[a + (j << 2) >> 2] = m;
				c[b + (j << 2) >> 2] = c[b + (l << 2) >> 2];
				j = l
			}
			g[a + (j << 2) >> 2] = k;
			c[b + (j << 2) >> 2] = h;
			h = h + 1 | 0
		}
		h = a + (e + -1 << 2) | 0;
		j = e + -2 | 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			k = +g[a + (e << 2) >> 2];
			if (k > +g[h >> 2]) {
				l = j;
				while (1) {
					if ((l | 0) <= -1) break;
					m = +g[a + (l << 2) >> 2];
					if (!(k > m)) break;
					n = l + 1 | 0;
					g[a + (n << 2) >> 2] = m;
					c[b + (n << 2) >> 2] = c[b + (l << 2) >> 2];
					l = l + -1 | 0
				}
				n = l + 1 | 0;
				g[a + (n << 2) >> 2] = k;
				c[b + (n << 2) >> 2] = e
			}
			e = e + 1 | 0
		}
		i = f;
		return
	}
	function _g(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = d | 0;
		e = e | 0;
		var f = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0,
			v = 0,
			w = 0;
		j = i;
		i = i + 272 | 0;
		k = j + 136 | 0;
		f = j;
		wj(k | 0, 0, 136) | 0;
		wj(f | 0, 0, 136) | 0;
		n = k + (e << 3) | 0;
		m = f + (e << 3) | 0;
		o = 0.0;
		l = 0;
		while (1) {
			if ((l | 0) >= (d | 0)) break;
			p = 0;
			q = +g[b + (l << 2) >> 2];
			while (1) {
				if ((p | 0) >= (e | 0)) break;
				v = p | 1;
				w = k + (v << 3) | 0;
				t = +h[w >> 3];
				r = o + c * (t - q);
				h[k + (p << 3) >> 3] = q;
				u = f + (p << 3) | 0;
				h[u >> 3] = +h[u >> 3] + +h[k >> 3] * q;
				u = p + 2 | 0;
				s = +h[k + (u << 3) >> 3];
				h[w >> 3] = r;
				v = f + (v << 3) | 0;
				h[v >> 3] = +h[v >> 3] + +h[k >> 3] * r;
				o = s;
				p = u;
				q = t + c * (s - r)
			}
			h[n >> 3] = q;
			o = +h[k >> 3];
			h[m >> 3] = +h[m >> 3] + o * q;
			l = l + 1 | 0
		}
		k = e + 1 | 0;
		d = 0;
		while (1) {
			if ((d | 0) >= (k | 0)) break;
			g[a + (d << 2) >> 2] = +h[f + (d << 3) >> 3];
			d = d + 1 | 0
		}
		i = j;
		return
	}
	function $g(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0;
		f = i;
		i = i + 64 | 0;
		e = f;
		h = 0;
		while (1) {
			if ((h | 0) >= (d | 0)) break;
			c[e + (h << 2) >> 2] = ah(+g[b + (h << 2) >> 2] * 65536.0) | 0;
			h = h + 1 | 0
		}
		Fd(a, e, d);
		i = f;
		return
	}
	function ah(a) {
		a = +a;
		var b = 0,
			c = 0;
		c = i;
		b = sa(+a) | 0;
		i = c;
		return b | 0
	}
	function bh(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		i = i + 32 | 0;
		f = e;
		Zd(f, c, d);
		c = 0;
		while (1) {
			if ((c | 0) >= (d | 0)) break;
			g[a + (c << 2) >> 2] = +(b[f + (c << 1) >> 1] | 0) * .000244140625;
			c = c + 1 | 0
		}
		i = e;
		return
	}
	function ch(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0;
		h = i;
		i = i + 64 | 0;
		j = h;
		th(a, j, e, f);
		a = a + 4664 | 0;
		f = 0;
		while (1) {
			if ((f | 0) < 2) e = 0;
			else break;
			while (1) {
				if ((e | 0) >= (c[a >> 2] | 0)) break;
				g[d + (f << 6) + (e << 2) >> 2] = +(b[j + (f << 5) + (e << 1) >> 1] | 0) * .000244140625;
				e = e + 1 | 0
			}
			f = f + 1 | 0
		}
		i = h;
		return
	}
	function dh(d, e, f, h, j, k) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0;
		s = i;
		i = i + 1584 | 0;
		m = s + 64 | 0;
		l = s + 48 | 0;
		t = s + 1512 | 0;
		n = s + 1472 | 0;
		o = s + 1344 | 0;
		r = s + 32 | 0;
		q = s + 16 | 0;
		p = s;
		u = d + 4604 | 0;
		w = d + 4660 | 0;
		v = 0;
		while (1) {
			x = c[u >> 2] | 0;
			if ((v | 0) >= (x | 0)) {
				v = 0;
				break
			}
			x = v << 4;
			y = 0;
			while (1) {
				if ((y | 0) >= (c[w >> 2] | 0)) break;
				z = x + y | 0;
				b[o + (z << 1) >> 1] = ah(+g[e + (z << 2) + 500 >> 2] * 8192.0) | 0;
				y = y + 1 | 0
			}
			v = v + 1 | 0
		}
		while (1) {
			if ((v | 0) >= (x | 0)) break;
			x = (ah(+g[e + (v << 2) + 772 >> 2] * 16384.0) | 0) << 16;
			c[r + (v << 2) >> 2] = x | (ah(+g[e + (v << 2) + 756 >> 2] * 16384.0) | 0) & 65535;
			c[q + (v << 2) >> 2] = ah(+g[e + (v << 2) + 820 >> 2] * 16384.0) | 0;
			c[p + (v << 2) >> 2] = ah(+g[e + (v << 2) + 836 >> 2] * 16384.0) | 0;
			x = c[u >> 2] | 0;
			v = v + 1 | 0
		}
		v = ah(+g[e + 852 >> 2] * 1024.0) | 0;
		w = 0;
		while (1) {
			if ((w | 0) >= ((c[u >> 2] | 0) * 5 | 0)) break;
			b[n + (w << 1) >> 1] = ah(+g[e + (w << 2) + 144 >> 2] * 16384.0) | 0;
			w = w + 1 | 0
		}
		w = d + 4664 | 0;
		x = 0;
		while (1) {
			if ((x | 0) < 2) y = 0;
			else {
				w = 0;
				break
			}
			while (1) {
				if ((y | 0) >= (c[w >> 2] | 0)) break;
				b[t + (x << 5) + (y << 1) >> 1] = ah(+g[e + (x << 6) + (y << 2) + 16 >> 2] * 4096.0) | 0;
				y = y + 1 | 0
			}
			x = x + 1 | 0
		}
		while (1) {
			if ((w | 0) >= (c[u >> 2] | 0)) break;
			c[l + (w << 2) >> 2] = ah(+g[e + (w << 2) >> 2] * 65536.0) | 0;
			w = w + 1 | 0
		}
		if ((a[f + 29 >> 0] | 0) == 2) w = b[24976 + (a[f + 33 >> 0] << 1) >> 1] | 0;
		else w = 0;
		u = d + 4608 | 0;
		x = 0;
		while (1) {
			if ((x | 0) >= (c[u >> 2] | 0)) break;
			c[m + (x << 2) >> 2] = ah(+g[k + (x << 2) >> 2] * 8.0) | 0;
			x = x + 1 | 0
		}
		if ((c[d + 4652 >> 2] | 0) <= 1 ? (c[d + 4704 >> 2] | 0) <= 0 : 0) {
			te(d, h, f, m, j, t, n, o, p, q, r, l, e + 228 | 0, v, w);
			i = s;
			return
		}
		ze(d, h, f, m, j, t, n, o, p, q, r, l, e + 228 | 0, v, w);
		i = s;
		return
	}
	function eh(a, d, e, f, h, j, k, l, m) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		p = i;
		i = i + 448 | 0;
		o = p + 400 | 0;
		q = p;
		n = l * 5 | 0;
		r = 0;
		while (1) {
			if ((r | 0) >= (n | 0)) break;
			b[o + (r << 1) >> 1] = ah(+g[a + (r << 2) >> 2] * 16384.0) | 0;
			r = r + 1 | 0
		}
		r = l * 25 | 0;
		s = 0;
		while (1) {
			if ((s | 0) >= (r | 0)) break;
			c[q + (s << 2) >> 2] = ah(+g[h + (s << 2) >> 2] * 262144.0) | 0;
			s = s + 1 | 0
		}
		uh(o, d, e, f, q, j, k, l, m);
		j = 0;
		while (1) {
			if ((j | 0) >= (n | 0)) break;
			g[a + (j << 2) >> 2] = +(b[o + (j << 1) >> 1] | 0) * 6103515625.0e-14;
			j = j + 1 | 0
		}
		i = p;
		return
	}
	function fh(b, e, f, g, h) {
		b = b | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		j = i;
		l = (g | 0) == 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (h | 0)) break;
			k = e + (g << 2) | 0;
			oh(c[k >> 2] | 0) | 0;
			n = ((((oh(c[k >> 2] | 0) | 0) << 16) + -136970240 >> 16) * 2251 | 0) >>> 16 & 255;
			m = b + g | 0;
			a[m >> 0] = n;
			if (n << 24 >> 24 < (a[f >> 0] | 0)) {
				n = n + 1 << 24 >> 24;
				a[m >> 0] = n
			}
			if (n << 24 >> 24 > 63) n = 63;
			else n = n << 24 >> 24 < 0 ? 0 : n;
			a[m >> 0] = n;
			if ((g | 0) == 0 ^ 1 | l ^ 1) {
				p = (n & 255) - (d[f >> 0] | 0) | 0;
				o = p & 255;
				a[m >> 0] = o;
				n = (a[f >> 0] | 0) + 8 | 0;
				p = p << 24 >> 24;
				if ((p | 0) > (n | 0)) {
					o = n + ((p - n + 1 | 0) >>> 1) & 255;
					a[m >> 0] = o
				}
				if (o << 24 >> 24 > 36) p = 36;
				else p = o << 24 >> 24 < -4 ? -4 : o;
				a[m >> 0] = p;
				o = p << 24 >> 24;
				if ((o | 0) > (n | 0)) n = (d[f >> 0] | 0) + ((o << 1) - n) | 0;
				else n = (d[f >> 0] | 0) + (p & 255) | 0;
				a[f >> 0] = n;
				a[m >> 0] = (d[m >> 0] | 0) + 4;
				m = a[f >> 0] | 0
			} else {
				m = (a[f >> 0] | 0) + -4 | 0;
				n = a[b >> 0] | 0;
				if ((m | 0) > 63) {
					o = n << 24 >> 24;
					if ((o | 0) <= (m | 0)) m = n << 24 >> 24 < 63 ? 63 : o
				} else if (n << 24 >> 24 > 63) m = 63;
				else {
					p = n << 24 >> 24;
					m = (p | 0) < (m | 0) ? m : p
				}
				m = m & 255;
				a[b >> 0] = m;
				a[f >> 0] = m
			}
			p = m << 24 >> 24;
			c[k >> 2] = sh(gh((p * 29 | 0) + (p * 7281 >> 16) + 2090 | 0) | 0) | 0;
			g = g + 1 | 0
		}
		i = j;
		return
	}
	function gh(a) {
		a = a | 0;
		return ((a | 0) < 3967 ? a : 3967) | 0
	}
	function hh(b, d, e, f, g) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		h = i;
		f = (f | 0) == 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (g | 0)) break;
			do
			if ((j | 0) == 0 ^ 1 | f ^ 1) {
				l = (a[d + j >> 0] | 0) + -4 | 0;
				m = a[e >> 0] | 0;
				k = (m << 24 >> 24) + 8 | 0;
				if ((l | 0) > (k | 0)) {
					k = (m & 255) + ((l << 1) - k) & 255;
					a[e >> 0] = k;
					break
				} else {
					k = (m & 255) + l & 255;
					a[e >> 0] = k;
					break
				}
			} else {
				k = (ih(a[d >> 0] | 0, (a[e >> 0] | 0) + -16 | 0) | 0) & 255;
				a[e >> 0] = k
			}
			while (0);
			if (k << 24 >> 24 > 63) k = 63;
			else k = k << 24 >> 24 < 0 ? 0 : k;
			a[e >> 0] = k;
			m = k << 24 >> 24;
			c[b + (j << 2) >> 2] = sh(gh((m * 29 | 0) + (m * 7281 >> 16) + 2090 | 0) | 0) | 0;
			j = j + 1 | 0
		}
		i = h;
		return
	}
	function ih(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function jh(b, c) {
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0;
		d = i;
		e = 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			e = (a[b + f >> 0] | 0) + (e << 8) | 0;
			f = f + 1 | 0
		}
		i = d;
		return e | 0
	}
	function kh(a) {
		a = a | 0;
		var b = 0;
		b = i;
		wj(a | 0, 0, 4260) | 0;
		c[a + 2376 >> 2] = 1;
		c[a >> 2] = 65536;
		Kd(a);
		Ge(a);
		i = b;
		return
	}
	function lh(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0;
		d = i;
		wj(a | 0, 0, 12240) | 0;
		c[a + 5124 >> 2] = b;
		b = ((oh(3932160) | 0) << 8) + -524288 | 0;
		c[a + 8 >> 2] = b;
		c[a + 12 >> 2] = b;
		c[a + 4696 >> 2] = 1;
		b = We(a + 32 | 0) | 0;
		i = d;
		return b | 0
	}
	function mh(a, c, d, e) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0;
		f = i;
		h = 0;
		g = 0;
		while (1) {
			if ((h | 0) >= (e | 0)) break;
			j = g + (($(b[a + (h << 1) >> 1] | 0, b[c + (h << 1) >> 1] | 0) | 0) >> d) | 0;
			h = h + 1 | 0;
			g = j
		}
		i = f;
		return g | 0
	}
	function nh(a, c, d, f, g) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0;
		h = i;
		j = f << 16 >> 16;
		f = 0;
		while (1) {
			if ((f | 0) >= (g | 0)) break;
			k = e[c + (f << 1) >> 1] | 0;
			b[a + (f << 1) >> 1] = k + (($((e[d + (f << 1) >> 1] | 0) - k << 16 >> 16, j) | 0) >>> 2);
			f = f + 1 | 0
		}
		i = h;
		return
	}
	function oh(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		e = i;
		i = i + 16 | 0;
		d = e + 4 | 0;
		b = e;
		ph(a, d, b);
		b = c[b >> 2] | 0;
		a = $(b, 128 - b | 0) | 0;
		i = e;
		return (31 - (c[d >> 2] | 0) << 7) + (b + (((a >> 16) * 179 | 0) + (((a & 65535) * 179 | 0) >>> 16))) | 0
	}
	function ph(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = qh(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (rh(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function qh(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function rh(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function sh(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0,
			e = 0;
		b = i;
		if ((a | 0) < 0) {
			e = 0;
			i = b;
			return e | 0
		}
		if ((a | 0) > 3966) {
			e = 2147483647;
			i = b;
			return e | 0
		}
		d = a >> 7;
		c = 1 << d;
		e = a & 127;
		if ((a | 0) < 2048) a = e + (($($(e, 128 - e | 0) | 0, -174) | 0) >> 16) << d >> 7;
		else a = $(c >> 7, e + (($($(e, 128 - e | 0) | 0, -174) | 0) >> 16) | 0) | 0;
		e = c + a | 0;
		i = b;
		return e | 0
	}
	function th(d, e, f, g) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		j = i;
		i = i + 96 | 0;
		h = j + 64 | 0;
		k = j + 32 | 0;
		l = j;
		n = c[d + 4556 >> 2] << 16 >> 16;
		n = ($(n, -5) | 0) + (n * 59246 >> 16) + 3146 | 0;
		if ((c[d + 4604 >> 2] | 0) == 2) n = n + (n >> 1) | 0;
		m = d + 4664 | 0;
		ae(k, f, c[m >> 2] | 0);
		a: do
		if ((c[d + 4656 >> 2] | 0) == 1) {
			p = d + 4799 | 0;
			q = a[p >> 0] | 0;
			r = q << 24 >> 24 < 4;
			o = r & 1;
			if (r) {
				nh(h, g, f, q << 24 >> 24, c[m >> 2] | 0);
				ae(l, h, c[m >> 2] | 0);
				q = a[p >> 0] | 0;
				q = ($(q, q) | 0) << 27;
				p = c[m >> 2] | 0;
				q = q >> 16;
				r = 0;
				while (1) {
					if ((r | 0) >= (p | 0)) break a;
					s = k + (r << 1) | 0;
					t = b[l + (r << 1) >> 1] | 0;
					b[s >> 1] = ((b[s >> 1] | 0) >>> 1) + (($(t << 16 >> 16 >> 16, q) | 0) + (($(t & 65535, q) | 0) >>> 16));
					r = r + 1 | 0
				}
			}
		} else o = 0;
		while (0);
		ke(d + 4776 | 0, f, c[d + 4724 >> 2] | 0, k, n, c[d + 4692 >> 2] | 0, a[d + 4797 >> 0] | 0);
		Zd(e + 32 | 0, f, c[m >> 2] | 0);
		if (!o) {
			yj(e | 0, e + 32 | 0, c[m >> 2] << 1 | 0) | 0;
			i = j;
			return
		} else {
			nh(h, g, f, a[d + 4799 >> 0] | 0, c[m >> 2] | 0);
			Zd(e, h, c[m >> 2] | 0);
			i = j;
			return
		}
	}
	function uh(d, e, f, g, h, j, k, l, m) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0;
		m = i;
		i = i + 16 | 0;
		p = m + 8 | 0;
		o = m + 4 | 0;
		n = m;
		k = (k | 0) != 0;
		r = 0;
		s = 2147483647;
		q = 0;
		while (1) {
			if ((q | 0) >= 3) break;
			w = c[22392 + (q << 2) >> 2] | 0;
			u = c[22688 + (q << 2) >> 2] | 0;
			v = c[22760 + (q << 2) >> 2] | 0;
			x = a[22776 + q >> 0] | 0;
			y = h;
			z = d;
			B = 0;
			A = 0;
			t = c[g >> 2] | 0;
			while (1) {
				if ((A | 0) >= (l | 0)) break;
				ef(p + A | 0, o, n, z, y, u, v, w, j, (sh(5333 - t + 896 | 0) | 0) + -51 | 0, x);
				B = B + (c[o >> 2] | 0) | 0;
				C = (c[n >> 2] | 0) + 51 | 0;
				if ((t + (oh(C) | 0) + -896 | 0) < 0) t = 0;
				else t = t + (oh(C) | 0) + -896 | 0;
				y = y + 100 | 0;
				z = z + 10 | 0;
				B = (B | 0) < 0 ? 2147483647 : B;
				A = A + 1 | 0
			}
			u = (B | 0) == 2147483647 ? 2147483646 : B;
			if ((u | 0) < (s | 0)) {
				a[f >> 0] = q;
				yj(e | 0, p | 0, l | 0) | 0;
				r = t;
				s = u
			}
			if (k & (u | 0) < 12304) break;
			q = q + 1 | 0
		}
		o = c[22688 + (a[f >> 0] << 2) >> 2] | 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (l | 0)) break;
			n = e + j | 0;
			h = j * 5 | 0;
			f = 0;
			while (1) {
				if ((f | 0) >= 5) break;
				b[d + (h + f << 1) >> 1] = a[o + (((a[n >> 0] | 0) * 5 | 0) + f) >> 0] << 7;
				f = f + 1 | 0
			}
			j = j + 1 | 0
		}
		c[g >> 2] = r;
		i = m;
		return
	}
	function vh(b, d, e, f) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0;
		g = i;
		wj(b | 0, 0, 300) | 0;
		do
		if (!f) {
			if (!((d | 0) == 8e3 | (d | 0) == 12e3 | (d | 0) == 16e3)) {
				h = -1;
				i = g;
				return h | 0
			}
			if ((e | 0) == 48e3 | (e | 0) == 24e3 | (e | 0) == 16e3 | (e | 0) == 12e3 | (e | 0) == 8e3) {
				c[b + 292 >> 2] = a[((e >> 12) - ((e | 0) > 16e3 & 1) >> ((e | 0) > 24e3 & 1)) + -1 + (21536 + ((((d >> 12) - ((d | 0) > 16e3 & 1) >> ((d | 0) > 24e3 & 1)) + -1 | 0) * 5 | 0)) >> 0];
				break
			} else {
				h = -1;
				i = g;
				return h | 0
			}
		} else {
			if (!((d | 0) == 8e3 | (d | 0) == 12e3 | (d | 0) == 16e3 | (d | 0) == 24e3 | (d | 0) == 48e3)) {
				h = -1;
				i = g;
				return h | 0
			}
			if ((e | 0) == 16e3 | (e | 0) == 12e3 | (e | 0) == 8e3) {
				c[b + 292 >> 2] = a[((e >> 12) - ((e | 0) > 16e3 & 1) >> ((e | 0) > 24e3 & 1)) + -1 + (21520 + ((((d >> 12) - ((d | 0) > 16e3 & 1) >> ((d | 0) > 24e3 & 1)) + -1 | 0) * 3 | 0)) >> 0];
				break
			} else {
				h = -1;
				i = g;
				return h | 0
			}
		}
		while (0);
		h = (d | 0) / 1e3 | 0;
		c[b + 284 >> 2] = h;
		c[b + 288 >> 2] = (e | 0) / 1e3 | 0;
		c[b + 268 >> 2] = h * 10;
		do
		if ((e | 0) > (d | 0)) {
			f = b + 264 | 0;
			if ((d << 1 | 0) == (e | 0)) {
				c[f >> 2] = 1;
				h = 0;
				break
			} else {
				c[f >> 2] = 2;
				h = 1;
				break
			}
		} else {
			f = b + 264 | 0;
			if ((e | 0) >= (d | 0)) {
				c[f >> 2] = 0;
				h = 0;
				break
			}
			c[f >> 2] = 3;
			h = e << 2;
			if ((h | 0) == (d * 3 | 0)) {
				c[b + 280 >> 2] = 3;
				c[b + 276 >> 2] = 18;
				c[b + 296 >> 2] = 21552;
				h = 0;
				break
			}
			f = e * 3 | 0;
			if ((f | 0) == (d << 1 | 0)) {
				c[b + 280 >> 2] = 2;
				c[b + 276 >> 2] = 18;
				c[b + 296 >> 2] = 21616;
				h = 0;
				break
			}
			if ((e << 1 | 0) == (d | 0)) {
				c[b + 280 >> 2] = 1;
				c[b + 276 >> 2] = 24;
				c[b + 296 >> 2] = 21656;
				h = 0;
				break
			}
			if ((f | 0) == (d | 0)) {
				c[b + 280 >> 2] = 1;
				c[b + 276 >> 2] = 36;
				c[b + 296 >> 2] = 21688;
				h = 0;
				break
			}
			if ((h | 0) == (d | 0)) {
				c[b + 280 >> 2] = 1;
				c[b + 276 >> 2] = 36;
				c[b + 296 >> 2] = 21728;
				h = 0;
				break
			}
			if ((e * 6 | 0) == (d | 0)) {
				c[b + 280 >> 2] = 1;
				c[b + 276 >> 2] = 36;
				c[b + 296 >> 2] = 21768;
				h = 0;
				break
			} else {
				h = -1;
				i = g;
				return h | 0
			}
		}
		while (0);
		j = ((d << (h | 14) | 0) / (e | 0) | 0) << 2;
		f = b + 272 | 0;
		c[f >> 2] = j;
		b = e << 16 >> 16;
		e = (e >> 15) + 1 >> 1;
		h = d << h;
		d = j;
		while (1) {
			if ((($(d >> 16, b) | 0) + (($(d & 65535, b) | 0) >> 16) + ($(d, e) | 0) | 0) >= (h | 0)) {
				d = 0;
				break
			}
			j = d + 1 | 0;
			c[f >> 2] = j;
			d = j
		}
		i = g;
		return d | 0
	}
	function wh(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		h = a + 284 | 0;
		g = a + 292 | 0;
		k = c[g >> 2] | 0;
		j = (c[h >> 2] | 0) - k | 0;
		yj(a + (k << 1) + 168 | 0, d | 0, j << 1 | 0) | 0;
		k = c[a + 264 >> 2] | 0;
		if ((k | 0) == 1) {
			Fh(a, b, a + 168 | 0, c[h >> 2] | 0);
			Fh(a, b + (c[a + 288 >> 2] << 1) | 0, d + (j << 1) | 0, e - (c[h >> 2] | 0) | 0)
		} else if ((k | 0) == 3) {
			Ch(a, b, a + 168 | 0, c[h >> 2] | 0);
			Ch(a, b + (c[a + 288 >> 2] << 1) | 0, d + (j << 1) | 0, e - (c[h >> 2] | 0) | 0)
		} else if ((k | 0) == 2) {
			Ah(a, b, a + 168 | 0, c[h >> 2] | 0);
			Ah(a, b + (c[a + 288 >> 2] << 1) | 0, d + (j << 1) | 0, e - (c[h >> 2] | 0) | 0)
		} else {
			yj(b | 0, a + 168 | 0, c[h >> 2] << 1 | 0) | 0;
			yj(b + (c[a + 288 >> 2] << 1) | 0, d + (j << 1) | 0, e - (c[h >> 2] | 0) << 1 | 0) | 0
		}
		b = c[g >> 2] | 0;
		yj(a + 168 | 0, d + (e - b << 1) | 0, b << 1 | 0) | 0;
		i = f;
		return
	}
	function xh(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		g = i;
		h = f >> 1;
		f = a + 4 | 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (h | 0)) break;
			o = j << 1;
			n = b[e + (o << 1) >> 1] << 10;
			l = n - (c[a >> 2] | 0) | 0;
			m = ($(l >> 16, -25727) | 0) + (($(l & 65535, -25727) | 0) >> 16) | 0;
			c[a >> 2] = n + (l + m);
			o = b[e + ((o | 1) << 1) >> 1] << 10;
			l = c[f >> 2] | 0;
			k = o - l | 0;
			k = ((k >> 16) * 9872 | 0) + (((k & 65535) * 9872 | 0) >>> 16) | 0;
			c[f >> 2] = o + k;
			k = (n + m + l + k >> 10) + 1 >> 1;
			if ((k | 0) > 32767) k = 32767;
			else k = (k | 0) < -32768 ? -32768 : k & 65535;
			b[d + (j << 1) >> 1] = k;
			j = j + 1 | 0
		}
		i = g;
		return
	}
	function yh(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		g = i;
		i = i + 1936 | 0;
		k = g;
		c[k + 0 >> 2] = c[a + 0 >> 2];
		c[k + 4 >> 2] = c[a + 4 >> 2];
		c[k + 8 >> 2] = c[a + 8 >> 2];
		c[k + 12 >> 2] = c[a + 12 >> 2];
		h = a + 16 | 0;
		j = k + 16 | 0;
		while (1) {
			l = (f | 0) < 480 ? f : 480;
			zh(h, j, e, 21808, l);
			o = k;
			m = l;
			while (1) {
				if ((m | 0) <= 2) break;
				u = c[o >> 2] | 0;
				p = o + 4 | 0;
				t = c[p >> 2] | 0;
				q = o + 8 | 0;
				s = c[q >> 2] | 0;
				n = o + 12 | 0;
				r = c[n >> 2] | 0;
				r = (((u >> 16) * 4697 | 0) + (((u & 65535) * 4697 | 0) >>> 16) + (((t >> 16) * 10739 | 0) + (((t & 65535) * 10739 | 0) >>> 16)) + (((s >> 16) * 8276 | 0) + (((s & 65535) * 8276 | 0) >>> 16)) + (((r >> 16) * 1567 | 0) + (((r & 65535) * 1567 | 0) >>> 16)) >> 5) + 1 >> 1;
				if ((r | 0) > 32767) r = 32767;
				else r = (r | 0) < -32768 ? -32768 : r & 65535;
				b[d >> 1] = r;
				s = c[p >> 2] | 0;
				t = c[q >> 2] | 0;
				u = c[n >> 2] | 0;
				o = c[o + 16 >> 2] | 0;
				o = (((s >> 16) * 1567 | 0) + (((s & 65535) * 1567 | 0) >>> 16) + (((t >> 16) * 8276 | 0) + (((t & 65535) * 8276 | 0) >>> 16)) + (((u >> 16) * 10739 | 0) + (((u & 65535) * 10739 | 0) >>> 16)) + (((o >> 16) * 4697 | 0) + (((o & 65535) * 4697 | 0) >>> 16)) >> 5) + 1 >> 1;
				if ((o | 0) > 32767) o = 32767;
				else o = (o | 0) < -32768 ? -32768 : o & 65535;
				b[d + 2 >> 1] = o;
				d = d + 4 | 0;
				o = n;
				m = m + -3 | 0
			}
			f = f - l | 0;
			if ((f | 0) <= 0) break;
			u = e + (l << 1) | 0;
			t = k + (l << 2) | 0;
			c[k + 0 >> 2] = c[t + 0 >> 2];
			c[k + 4 >> 2] = c[t + 4 >> 2];
			c[k + 8 >> 2] = c[t + 8 >> 2];
			c[k + 12 >> 2] = c[t + 12 >> 2];
			e = u
		}
		u = k + (l << 2) | 0;
		c[a + 0 >> 2] = c[u + 0 >> 2];
		c[a + 4 >> 2] = c[u + 4 >> 2];
		c[a + 8 >> 2] = c[u + 8 >> 2];
		c[a + 12 >> 2] = c[u + 12 >> 2];
		i = g;
		return
	}
	function zh(a, d, e, f, g) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		h = i;
		k = a + 4 | 0;
		l = f + 2 | 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (g | 0)) break;
			n = (c[a >> 2] | 0) + (b[e + (j << 1) >> 1] << 8) | 0;
			c[d + (j << 2) >> 2] = n;
			n = n << 2;
			o = n >> 16;
			m = b[f >> 1] | 0;
			n = n & 65532;
			c[a >> 2] = (c[k >> 2] | 0) + (($(o, m) | 0) + (($(n, m) | 0) >> 16));
			m = b[l >> 1] | 0;
			c[k >> 2] = ($(o, m) | 0) + (($(n, m) | 0) >> 16);
			j = j + 1 | 0
		}
		i = h;
		return
	}
	function Ah(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		h = i;
		n = c[a + 268 >> 2] | 0;
		m = i;
		i = i + ((2 * ((n << 1) + 8 | 0) | 0) + 15 & -16) | 0;
		g = a + 24 | 0;
		b[m + 0 >> 1] = b[g + 0 >> 1] | 0;
		b[m + 2 >> 1] = b[g + 2 >> 1] | 0;
		b[m + 4 >> 1] = b[g + 4 >> 1] | 0;
		b[m + 6 >> 1] = b[g + 6 >> 1] | 0;
		b[m + 8 >> 1] = b[g + 8 >> 1] | 0;
		b[m + 10 >> 1] = b[g + 10 >> 1] | 0;
		b[m + 12 >> 1] = b[g + 12 >> 1] | 0;
		b[m + 14 >> 1] = b[g + 14 >> 1] | 0;
		k = c[a + 272 >> 2] | 0;
		l = a + 268 | 0;
		j = m + 16 | 0;
		while (1) {
			n = (f | 0) < (n | 0) ? f : n;
			Eh(a, j, e, n);
			d = Bh(d, m, n << 17, k) | 0;
			f = f - n | 0;
			if ((f | 0) <= 0) break;
			o = e + (n << 1) | 0;
			n = m + (n << 1 << 1) | 0;
			b[m + 0 >> 1] = b[n + 0 >> 1] | 0;
			b[m + 2 >> 1] = b[n + 2 >> 1] | 0;
			b[m + 4 >> 1] = b[n + 4 >> 1] | 0;
			b[m + 6 >> 1] = b[n + 6 >> 1] | 0;
			b[m + 8 >> 1] = b[n + 8 >> 1] | 0;
			b[m + 10 >> 1] = b[n + 10 >> 1] | 0;
			b[m + 12 >> 1] = b[n + 12 >> 1] | 0;
			b[m + 14 >> 1] = b[n + 14 >> 1] | 0;
			e = o;
			n = c[l >> 2] | 0
		}
		o = m + (n << 1 << 1) | 0;
		b[g + 0 >> 1] = b[o + 0 >> 1] | 0;
		b[g + 2 >> 1] = b[o + 2 >> 1] | 0;
		b[g + 4 >> 1] = b[o + 4 >> 1] | 0;
		b[g + 6 >> 1] = b[o + 6 >> 1] | 0;
		b[g + 8 >> 1] = b[o + 8 >> 1] | 0;
		b[g + 10 >> 1] = b[o + 10 >> 1] | 0;
		b[g + 12 >> 1] = b[o + 12 >> 1] | 0;
		b[g + 14 >> 1] = b[o + 14 >> 1] | 0;
		i = h;
		return
	}
	function Bh(a, c, d, e) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		g = 0;
		while (1) {
			if ((g | 0) >= (d | 0)) break;
			h = ((g & 65535) * 12 | 0) >>> 16;
			j = g >> 16;
			k = $(b[c + (j << 1) >> 1] | 0, b[21824 + (h << 3) >> 1] | 0) | 0;
			k = k + ($(b[c + (j + 1 << 1) >> 1] | 0, b[21826 + (h << 3) >> 1] | 0) | 0) | 0;
			k = k + ($(b[c + (j + 2 << 1) >> 1] | 0, b[21828 + (h << 3) >> 1] | 0) | 0) | 0;
			k = k + ($(b[c + (j + 3 << 1) >> 1] | 0, b[21830 + (h << 3) >> 1] | 0) | 0) | 0;
			h = 11 - h | 0;
			k = k + ($(b[c + (j + 4 << 1) >> 1] | 0, b[21830 + (h << 3) >> 1] | 0) | 0) | 0;
			k = k + ($(b[c + (j + 5 << 1) >> 1] | 0, b[21828 + (h << 3) >> 1] | 0) | 0) | 0;
			k = k + ($(b[c + (j + 6 << 1) >> 1] | 0, b[21826 + (h << 3) >> 1] | 0) | 0) | 0;
			h = (k + ($(b[c + (j + 7 << 1) >> 1] | 0, b[21824 + (h << 3) >> 1] | 0) | 0) >> 14) + 1 >> 1;
			if ((h | 0) > 32767) h = 32767;
			else h = (h | 0) < -32768 ? -32768 : h & 65535;
			b[a >> 1] = h;
			a = a + 2 | 0;
			g = g + e | 0
		}
		i = f;
		return a | 0
	}
	function Ch(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		j = i;
		p = c[a + 268 >> 2] | 0;
		q = c[a + 276 >> 2] | 0;
		g = i;
		i = i + ((4 * (p + q | 0) | 0) + 15 & -16) | 0;
		o = a + 24 | 0;
		h = a + 276 | 0;
		yj(g | 0, o | 0, q << 2 | 0) | 0;
		k = a + 296 | 0;
		l = (c[k >> 2] | 0) + 4 | 0;
		n = c[a + 272 >> 2] | 0;
		f = a + 268 | 0;
		m = a + 280 | 0;
		while (1) {
			p = (e | 0) < (p | 0) ? e : p;
			zh(a, g + (q << 2) | 0, d, c[k >> 2] | 0, p);
			b = Dh(b, g, l, c[h >> 2] | 0, c[m >> 2] | 0, p << 16, n) | 0;
			e = e - p | 0;
			if ((e | 0) <= 1) break;
			q = c[h >> 2] | 0;
			yj(g | 0, g + (p << 2) | 0, q << 2 | 0) | 0;
			d = d + (p << 1) | 0;
			p = c[f >> 2] | 0
		}
		yj(o | 0, g + (p << 2) | 0, c[h >> 2] << 2 | 0) | 0;
		i = j;
		return
	}
	function Dh(a, d, e, f, g, h, j) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0;
		k = i;
		if ((f | 0) == 36) {
			m = e + 2 | 0;
			n = e + 4 | 0;
			o = e + 6 | 0;
			p = e + 8 | 0;
			q = e + 10 | 0;
			r = e + 12 | 0;
			s = e + 14 | 0;
			t = e + 16 | 0;
			u = e + 18 | 0;
			v = e + 20 | 0;
			w = e + 22 | 0;
			x = e + 24 | 0;
			y = e + 26 | 0;
			z = e + 28 | 0;
			l = e + 30 | 0;
			g = e + 32 | 0;
			f = e + 34 | 0;
			A = 0;
			while (1) {
				if ((A | 0) >= (h | 0)) break;
				C = A >> 16;
				B = (c[d + (C << 2) >> 2] | 0) + (c[d + (C + 35 << 2) >> 2] | 0) | 0;
				D = b[e >> 1] | 0;
				D = ($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16) | 0;
				B = (c[d + (C + 1 << 2) >> 2] | 0) + (c[d + (C + 34 << 2) >> 2] | 0) | 0;
				E = b[m >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 2 << 2) >> 2] | 0) + (c[d + (C + 33 << 2) >> 2] | 0) | 0;
				D = b[n >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 3 << 2) >> 2] | 0) + (c[d + (C + 32 << 2) >> 2] | 0) | 0;
				E = b[o >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 4 << 2) >> 2] | 0) + (c[d + (C + 31 << 2) >> 2] | 0) | 0;
				D = b[p >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 5 << 2) >> 2] | 0) + (c[d + (C + 30 << 2) >> 2] | 0) | 0;
				E = b[q >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 6 << 2) >> 2] | 0) + (c[d + (C + 29 << 2) >> 2] | 0) | 0;
				D = b[r >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 7 << 2) >> 2] | 0) + (c[d + (C + 28 << 2) >> 2] | 0) | 0;
				E = b[s >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 8 << 2) >> 2] | 0) + (c[d + (C + 27 << 2) >> 2] | 0) | 0;
				D = b[t >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 9 << 2) >> 2] | 0) + (c[d + (C + 26 << 2) >> 2] | 0) | 0;
				E = b[u >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 10 << 2) >> 2] | 0) + (c[d + (C + 25 << 2) >> 2] | 0) | 0;
				D = b[v >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 11 << 2) >> 2] | 0) + (c[d + (C + 24 << 2) >> 2] | 0) | 0;
				E = b[w >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 12 << 2) >> 2] | 0) + (c[d + (C + 23 << 2) >> 2] | 0) | 0;
				D = b[x >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 13 << 2) >> 2] | 0) + (c[d + (C + 22 << 2) >> 2] | 0) | 0;
				E = b[y >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 14 << 2) >> 2] | 0) + (c[d + (C + 21 << 2) >> 2] | 0) | 0;
				D = b[z >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				B = (c[d + (C + 15 << 2) >> 2] | 0) + (c[d + (C + 20 << 2) >> 2] | 0) | 0;
				E = b[l >> 1] | 0;
				E = D + (($(B >> 16, E) | 0) + (($(B & 65535, E) | 0) >> 16)) | 0;
				B = (c[d + (C + 16 << 2) >> 2] | 0) + (c[d + (C + 19 << 2) >> 2] | 0) | 0;
				D = b[g >> 1] | 0;
				D = E + (($(B >> 16, D) | 0) + (($(B & 65535, D) | 0) >> 16)) | 0;
				C = (c[d + (C + 17 << 2) >> 2] | 0) + (c[d + (C + 18 << 2) >> 2] | 0) | 0;
				B = b[f >> 1] | 0;
				B = (D + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) >> 5) + 1 >> 1;
				if ((B | 0) > 32767) B = 32767;
				else B = (B | 0) < -32768 ? -32768 : B & 65535;
				b[a >> 1] = B;
				a = a + 2 | 0;
				A = A + j | 0
			}
			i = k;
			return a | 0
		} else if ((f | 0) == 18) {
			f = g << 16 >> 16;
			g = g + -1 | 0;
			l = 0;
			while (1) {
				if ((l | 0) >= (h | 0)) break;
				E = l >> 16;
				m = ($(l & 65535, f) | 0) >> 16;
				D = m * 9 | 0;
				C = c[d + (E << 2) >> 2] | 0;
				A = b[e + (D << 1) >> 1] | 0;
				A = ($(C >> 16, A) | 0) + (($(C & 65535, A) | 0) >> 16) | 0;
				C = c[d + (E + 1 << 2) >> 2] | 0;
				B = b[e + (D + 1 << 1) >> 1] | 0;
				B = A + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 2 << 2) >> 2] | 0;
				A = b[e + (D + 2 << 1) >> 1] | 0;
				A = B + (($(C >> 16, A) | 0) + (($(C & 65535, A) | 0) >> 16)) | 0;
				C = c[d + (E + 3 << 2) >> 2] | 0;
				B = b[e + (D + 3 << 1) >> 1] | 0;
				B = A + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 4 << 2) >> 2] | 0;
				A = b[e + (D + 4 << 1) >> 1] | 0;
				A = B + (($(C >> 16, A) | 0) + (($(C & 65535, A) | 0) >> 16)) | 0;
				C = c[d + (E + 5 << 2) >> 2] | 0;
				B = b[e + (D + 5 << 1) >> 1] | 0;
				B = A + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 6 << 2) >> 2] | 0;
				A = b[e + (D + 6 << 1) >> 1] | 0;
				A = B + (($(C >> 16, A) | 0) + (($(C & 65535, A) | 0) >> 16)) | 0;
				C = c[d + (E + 7 << 2) >> 2] | 0;
				B = b[e + (D + 7 << 1) >> 1] | 0;
				B = A + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 8 << 2) >> 2] | 0;
				D = b[e + (D + 8 << 1) >> 1] | 0;
				D = B + (($(C >> 16, D) | 0) + (($(C & 65535, D) | 0) >> 16)) | 0;
				m = (g - m | 0) * 9 | 0;
				C = c[d + (E + 17 << 2) >> 2] | 0;
				B = b[e + (m << 1) >> 1] | 0;
				B = D + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 16 << 2) >> 2] | 0;
				D = b[e + (m + 1 << 1) >> 1] | 0;
				D = B + (($(C >> 16, D) | 0) + (($(C & 65535, D) | 0) >> 16)) | 0;
				C = c[d + (E + 15 << 2) >> 2] | 0;
				B = b[e + (m + 2 << 1) >> 1] | 0;
				B = D + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 14 << 2) >> 2] | 0;
				D = b[e + (m + 3 << 1) >> 1] | 0;
				D = B + (($(C >> 16, D) | 0) + (($(C & 65535, D) | 0) >> 16)) | 0;
				C = c[d + (E + 13 << 2) >> 2] | 0;
				B = b[e + (m + 4 << 1) >> 1] | 0;
				B = D + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 12 << 2) >> 2] | 0;
				D = b[e + (m + 5 << 1) >> 1] | 0;
				D = B + (($(C >> 16, D) | 0) + (($(C & 65535, D) | 0) >> 16)) | 0;
				C = c[d + (E + 11 << 2) >> 2] | 0;
				B = b[e + (m + 6 << 1) >> 1] | 0;
				B = D + (($(C >> 16, B) | 0) + (($(C & 65535, B) | 0) >> 16)) | 0;
				C = c[d + (E + 10 << 2) >> 2] | 0;
				D = b[e + (m + 7 << 1) >> 1] | 0;
				D = B + (($(C >> 16, D) | 0) + (($(C & 65535, D) | 0) >> 16)) | 0;
				E = c[d + (E + 9 << 2) >> 2] | 0;
				m = b[e + (m + 8 << 1) >> 1] | 0;
				m = (D + (($(E >> 16, m) | 0) + (($(E & 65535, m) | 0) >> 16)) >> 5) + 1 >> 1;
				if ((m | 0) > 32767) m = 32767;
				else m = (m | 0) < -32768 ? -32768 : m & 65535;
				b[a >> 1] = m;
				a = a + 2 | 0;
				l = l + j | 0
			}
			i = k;
			return a | 0
		} else if ((f | 0) == 24) {
			l = e + 2 | 0;
			t = e + 4 | 0;
			s = e + 6 | 0;
			r = e + 8 | 0;
			q = e + 10 | 0;
			p = e + 12 | 0;
			o = e + 14 | 0;
			n = e + 16 | 0;
			m = e + 18 | 0;
			f = e + 20 | 0;
			g = e + 22 | 0;
			u = 0;
			while (1) {
				if ((u | 0) >= (h | 0)) break;
				E = u >> 16;
				v = (c[d + (E << 2) >> 2] | 0) + (c[d + (E + 23 << 2) >> 2] | 0) | 0;
				D = b[e >> 1] | 0;
				D = ($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16) | 0;
				v = (c[d + (E + 1 << 2) >> 2] | 0) + (c[d + (E + 22 << 2) >> 2] | 0) | 0;
				C = b[l >> 1] | 0;
				C = D + (($(v >> 16, C) | 0) + (($(v & 65535, C) | 0) >> 16)) | 0;
				v = (c[d + (E + 2 << 2) >> 2] | 0) + (c[d + (E + 21 << 2) >> 2] | 0) | 0;
				D = b[t >> 1] | 0;
				D = C + (($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16)) | 0;
				v = (c[d + (E + 3 << 2) >> 2] | 0) + (c[d + (E + 20 << 2) >> 2] | 0) | 0;
				C = b[s >> 1] | 0;
				C = D + (($(v >> 16, C) | 0) + (($(v & 65535, C) | 0) >> 16)) | 0;
				v = (c[d + (E + 4 << 2) >> 2] | 0) + (c[d + (E + 19 << 2) >> 2] | 0) | 0;
				D = b[r >> 1] | 0;
				D = C + (($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16)) | 0;
				v = (c[d + (E + 5 << 2) >> 2] | 0) + (c[d + (E + 18 << 2) >> 2] | 0) | 0;
				C = b[q >> 1] | 0;
				C = D + (($(v >> 16, C) | 0) + (($(v & 65535, C) | 0) >> 16)) | 0;
				v = (c[d + (E + 6 << 2) >> 2] | 0) + (c[d + (E + 17 << 2) >> 2] | 0) | 0;
				D = b[p >> 1] | 0;
				D = C + (($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16)) | 0;
				v = (c[d + (E + 7 << 2) >> 2] | 0) + (c[d + (E + 16 << 2) >> 2] | 0) | 0;
				C = b[o >> 1] | 0;
				C = D + (($(v >> 16, C) | 0) + (($(v & 65535, C) | 0) >> 16)) | 0;
				v = (c[d + (E + 8 << 2) >> 2] | 0) + (c[d + (E + 15 << 2) >> 2] | 0) | 0;
				D = b[n >> 1] | 0;
				D = C + (($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16)) | 0;
				v = (c[d + (E + 9 << 2) >> 2] | 0) + (c[d + (E + 14 << 2) >> 2] | 0) | 0;
				C = b[m >> 1] | 0;
				C = D + (($(v >> 16, C) | 0) + (($(v & 65535, C) | 0) >> 16)) | 0;
				v = (c[d + (E + 10 << 2) >> 2] | 0) + (c[d + (E + 13 << 2) >> 2] | 0) | 0;
				D = b[f >> 1] | 0;
				D = C + (($(v >> 16, D) | 0) + (($(v & 65535, D) | 0) >> 16)) | 0;
				E = (c[d + (E + 11 << 2) >> 2] | 0) + (c[d + (E + 12 << 2) >> 2] | 0) | 0;
				v = b[g >> 1] | 0;
				v = (D + (($(E >> 16, v) | 0) + (($(E & 65535, v) | 0) >> 16)) >> 5) + 1 >> 1;
				if ((v | 0) > 32767) v = 32767;
				else v = (v | 0) < -32768 ? -32768 : v & 65535;
				b[a >> 1] = v;
				a = a + 2 | 0;
				u = u + j | 0
			}
			i = k;
			return a | 0
		} else {
			E = a;
			i = k;
			return E | 0
		}
		return 0
	}
	function Eh(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		n = i;
		k = a + 4 | 0;
		l = a + 8 | 0;
		g = a + 12 | 0;
		h = a + 16 | 0;
		j = a + 20 | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (f | 0)) break;
			p = b[e + (m << 1) >> 1] << 10;
			o = c[a >> 2] | 0;
			q = p - o | 0;
			q = ((q >> 16) * 1746 | 0) + (((q & 65535) * 1746 | 0) >>> 16) | 0;
			o = o + q | 0;
			c[a >> 2] = p + q;
			q = c[k >> 2] | 0;
			r = o - q | 0;
			r = ((r >> 16) * 14986 | 0) + (((r & 65535) * 14986 | 0) >>> 16) | 0;
			q = q + r | 0;
			c[k >> 2] = o + r;
			r = q - (c[l >> 2] | 0) | 0;
			o = ($(r >> 16, -26453) | 0) + (($(r & 65535, -26453) | 0) >> 16) | 0;
			c[l >> 2] = q + (r + o);
			o = (q + o >> 9) + 1 >> 1;
			if ((o | 0) > 32767) q = 32767;
			else q = (o | 0) < -32768 ? -32768 : o & 65535;
			o = m << 1;
			b[d + (o << 1) >> 1] = q;
			s = c[g >> 2] | 0;
			r = p - s | 0;
			r = ((r >> 16) * 6854 | 0) + (((r & 65535) * 6854 | 0) >>> 16) | 0;
			s = s + r | 0;
			c[g >> 2] = p + r;
			r = c[h >> 2] | 0;
			q = s - r | 0;
			q = ((q >> 16) * 25769 | 0) + (((q & 65535) * 25769 | 0) >>> 16) | 0;
			r = r + q | 0;
			c[h >> 2] = s + q;
			q = r - (c[j >> 2] | 0) | 0;
			p = ($(q >> 16, -9994) | 0) + (($(q & 65535, -9994) | 0) >> 16) | 0;
			c[j >> 2] = r + (q + p);
			p = (r + p >> 9) + 1 >> 1;
			if ((p | 0) > 32767) p = 32767;
			else p = (p | 0) < -32768 ? -32768 : p & 65535;
			b[d + ((o | 1) << 1) >> 1] = p;
			m = m + 1 | 0
		}
		i = n;
		return
	}
	function Fh(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0;
		e = i;
		Eh(a, b, c, d);
		i = e;
		return
	}
	function Gh(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		i = i + 64 | 0;
		e = d + 32 | 0;
		g = d + 16 | 0;
		f = d + 8 | 0;
		j = d;
		Hh(e, b, 8);
		Hh(g, e, 4);
		Hh(f, g, 2);
		Hh(j, f, 1);
		h = c[f >> 2] | 0;
		Ih(a, h, c[j >> 2] | 0, 26128);
		j = c[g >> 2] | 0;
		Ih(a, j, h, 25976);
		h = c[e >> 2] | 0;
		Ih(a, h, j, 25824);
		Ih(a, c[b >> 2] | 0, h, 25672);
		Ih(a, c[b + 8 >> 2] | 0, c[e + 4 >> 2] | 0, 25672);
		h = c[e + 8 >> 2] | 0;
		Ih(a, h, c[g + 4 >> 2] | 0, 25824);
		Ih(a, c[b + 16 >> 2] | 0, h, 25672);
		Ih(a, c[b + 24 >> 2] | 0, c[e + 12 >> 2] | 0, 25672);
		h = c[g + 8 >> 2] | 0;
		Ih(a, h, c[f + 4 >> 2] | 0, 25976);
		f = c[e + 16 >> 2] | 0;
		Ih(a, f, h, 25824);
		Ih(a, c[b + 32 >> 2] | 0, f, 25672);
		Ih(a, c[b + 40 >> 2] | 0, c[e + 20 >> 2] | 0, 25672);
		f = c[e + 24 >> 2] | 0;
		Ih(a, f, c[g + 12 >> 2] | 0, 25824);
		Ih(a, c[b + 48 >> 2] | 0, f, 25672);
		Ih(a, c[b + 56 >> 2] | 0, c[e + 28 >> 2] | 0, 25672);
		i = d;
		return
	}
	function Hh(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		e = i;
		f = 0;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			g = f << 1;
			c[a + (f << 2) >> 2] = (c[b + (g << 2) >> 2] | 0) + (c[b + ((g | 1) << 2) >> 2] | 0);
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function Ih(a, b, c, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		e = e | 0;
		var f = 0;
		f = i;
		if ((c | 0) <= 0) {
			i = f;
			return
		}
		Cc(a, b, e + (d[26280 + c >> 0] | 0) | 0, 8);
		i = f;
		return
	}
	function Jh(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		e = i;
		i = i + 32 | 0;
		j = e + 24 | 0;
		g = e + 16 | 0;
		h = e;
		f = j + 2 | 0;
		Kh(j, f, c, d, 26128);
		k = g + 2 | 0;
		Kh(g, k, c, b[j >> 1] | 0, 25976);
		d = h + 2 | 0;
		Kh(h, d, c, b[g >> 1] | 0, 25824);
		Kh(a, a + 2 | 0, c, b[h >> 1] | 0, 25672);
		Kh(a + 4 | 0, a + 6 | 0, c, b[d >> 1] | 0, 25672);
		d = h + 4 | 0;
		j = h + 6 | 0;
		Kh(d, j, c, b[k >> 1] | 0, 25824);
		Kh(a + 8 | 0, a + 10 | 0, c, b[d >> 1] | 0, 25672);
		Kh(a + 12 | 0, a + 14 | 0, c, b[j >> 1] | 0, 25672);
		j = g + 4 | 0;
		g = g + 6 | 0;
		Kh(j, g, c, b[f >> 1] | 0, 25976);
		d = h + 8 | 0;
		f = h + 10 | 0;
		Kh(d, f, c, b[j >> 1] | 0, 25824);
		Kh(a + 16 | 0, a + 18 | 0, c, b[d >> 1] | 0, 25672);
		Kh(a + 20 | 0, a + 22 | 0, c, b[f >> 1] | 0, 25672);
		f = h + 12 | 0;
		d = h + 14 | 0;
		Kh(f, d, c, b[g >> 1] | 0, 25824);
		Kh(a + 24 | 0, a + 26 | 0, c, b[f >> 1] | 0, 25672);
		Kh(a + 28 | 0, a + 30 | 0, c, b[d >> 1] | 0, 25672);
		i = e;
		return
	}
	function Kh(a, c, e, f, g) {
		a = a | 0;
		c = c | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0;
		h = i;
		if ((f | 0) > 0) {
			g = sc(e, g + (d[26280 + f >> 0] | 0) | 0, 8) | 0;
			b[a >> 1] = g;
			a = f - g & 65535;
			b[c >> 1] = a;
			i = h;
			return
		} else {
			b[a >> 1] = 0;
			a = 0;
			b[c >> 1] = a;
			i = h;
			return
		}
	}
	function Lh(a) {
		a = a | 0;
		var b = 0,
			d = 0;
		b = i;
		if ((a | 0) < 0) {
			a = 0 - a | 0;
			if ((a | 0) > 191) {
				a = 0;
				i = b;
				return a | 0
			}
			d = a >> 5;
			a = (c[21920 + (d << 2) >> 2] | 0) - ($(c[21944 + (d << 2) >> 2] << 16 >> 16, a & 31) | 0) | 0;
			i = b;
			return a | 0
		} else {
			if ((a | 0) > 191) {
				d = 32767;
				i = b;
				return d | 0
			}
			d = a >> 5;
			d = (c[21968 + (d << 2) >> 2] | 0) + ($(c[21944 + (d << 2) >> 2] << 16 >> 16, a & 31) | 0) | 0;
			i = b;
			return d | 0
		}
		return 0
	}
	function Mh(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		f = i;
		g = 0;
		while (1) {
			if ((g | 0) >= (e | 0)) {
				g = 1;
				break
			}
			c[b + (g << 2) >> 2] = g;
			g = g + 1 | 0
		}
		while (1) {
			if ((g | 0) >= (e | 0)) break;
			h = c[a + (g << 2) >> 2] | 0;
			j = g;
			while (1) {
				k = j + -1 | 0;
				if ((j | 0) <= 0) break;
				l = c[a + (k << 2) >> 2] | 0;
				if ((h | 0) >= (l | 0)) break;
				c[a + (j << 2) >> 2] = l;
				c[b + (j << 2) >> 2] = c[b + (k << 2) >> 2];
				j = k
			}
			c[a + (j << 2) >> 2] = h;
			c[b + (j << 2) >> 2] = g;
			g = g + 1 | 0
		}
		g = a + (e + -1 << 2) | 0;
		h = e + -2 | 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			j = c[a + (e << 2) >> 2] | 0;
			if ((j | 0) < (c[g >> 2] | 0)) {
				k = h;
				while (1) {
					if ((k | 0) <= -1) break;
					l = c[a + (k << 2) >> 2] | 0;
					if ((j | 0) >= (l | 0)) break;
					m = k + 1 | 0;
					c[a + (m << 2) >> 2] = l;
					c[b + (m << 2) >> 2] = c[b + (k << 2) >> 2];
					k = k + -1 | 0
				}
				m = k + 1 | 0;
				c[a + (m << 2) >> 2] = j;
				c[b + (m << 2) >> 2] = e
			}
			e = e + 1 | 0
		}
		i = f;
		return
	}
	function Nh(a, c) {
		a = a | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		d = i;
		e = 1;
		while (1) {
			if ((e | 0) >= (c | 0)) break;
			f = b[a + (e << 1) >> 1] | 0;
			g = e;
			while (1) {
				h = g + -1 | 0;
				if ((g | 0) <= 0) break;
				j = b[a + (h << 1) >> 1] | 0;
				if (f << 16 >> 16 >= j << 16 >> 16) break;
				b[a + (g << 1) >> 1] = j;
				g = h
			}
			b[a + (g << 1) >> 1] = f;
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function Oh(d, f, g, h, j, k, l, m, n, o, p) {
		d = d | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		var q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0;
		q = i;
		i = i + 16 | 0;
		s = q + 8 | 0;
		w = q + 4 | 0;
		x = q;
		u = f + -4 | 0;
		v = p + 2 | 0;
		r = i;
		i = i + ((2 * v | 0) + 15 & -16) | 0;
		y = 0;
		while (1) {
			if ((y | 0) >= (v | 0)) break;
			z = y + -2 | 0;
			A = b[f + (z << 1) >> 1] | 0;
			z = b[g + (z << 1) >> 1] | 0;
			B = A + z | 0;
			z = A - z | 0;
			b[f + (y + -2 << 1) >> 1] = (B >>> 1) + (B & 1);
			z = (z >> 1) + (z & 1) | 0;
			if ((z | 0) > 32767) z = 32767;
			else z = (z | 0) < -32768 ? -32768 : z & 65535;
			b[r + (y << 1) >> 1] = z;
			y = y + 1 | 0
		}
		v = d + 4 | 0;
		y = e[v >> 1] | e[v + 2 >> 1] << 16;
		b[u >> 1] = y;
		b[u + 2 >> 1] = y >>> 16;
		u = d + 8 | 0;
		y = e[u >> 1] | e[u + 2 >> 1] << 16;
		c[r >> 2] = y;
		z = f + (p + -2 << 1) | 0;
		z = e[z >> 1] | e[z + 2 >> 1] << 16;
		b[v >> 1] = z;
		b[v + 2 >> 1] = z >>> 16;
		v = r + (p << 1) | 0;
		v = e[v >> 1] | e[v + 2 >> 1] << 16;
		b[u >> 1] = v;
		b[u + 2 >> 1] = v >>> 16;
		u = i;
		i = i + ((2 * p | 0) + 15 & -16) | 0;
		v = i;
		i = i + ((2 * p | 0) + 15 & -16) | 0;
		y = y & 65535;
		z = 0;
		while (1) {
			if ((z | 0) >= (p | 0)) break;
			A = b[f + (z + -1 << 1) >> 1] | 0;
			B = ((b[f + (z + -2 << 1) >> 1] | 0) + (b[f + (z << 1) >> 1] | 0) + (A << 16 >> 16 << 1) >> 1) + 1 >> 1;
			b[u + (z << 1) >> 1] = B;
			b[v + (z << 1) >> 1] = (A & 65535) - B;
			z = z + 1 | 0
		}
		A = i;
		i = i + ((2 * p | 0) + 15 & -16) | 0;
		z = i;
		i = i + ((2 * p | 0) + 15 & -16) | 0;
		B = 0;
		while (1) {
			if ((B | 0) >= (p | 0)) break;
			C = B + 1 | 0;
			D = b[r + (C << 1) >> 1] | 0;
			E = ((y << 16 >> 16) + (b[r + (B + 2 << 1) >> 1] | 0) + (D << 16 >> 16 << 1) >> 1) + 1 >> 1;
			b[A + (B << 1) >> 1] = E;
			b[z + (B << 1) >> 1] = (D & 65535) - E;
			y = D;
			B = C
		}
		E = (o * 10 | 0) == (p | 0);
		y = E ? 328 : 655;
		m = m << 16 >> 16;
		m = $(m, m) | 0;
		y = ($(m >>> 16, y) | 0) + (($(m & 65535, y) | 0) >>> 16) | 0;
		u = Xh(w, u, A, d + 12 | 0, p, y) | 0;
		c[s >> 2] = u;
		v = Xh(x, v, z, d + 20 | 0, p, y) | 0;
		m = s + 4 | 0;
		c[m >> 2] = v;
		w = (c[x >> 2] | 0) + ((c[w >> 2] << 16 >> 16) * 3 | 0) | 0;
		w = (w | 0) < 65536 ? w : 65536;
		l = l - (E ? 1200 : 600) | 0;
		l = (l | 0) < 1 ? 1 : l;
		x = ((o << 16 >> 16) * 900 | 0) + 2e3 | 0;
		A = w * 3 | 0;
		z = Ph(l, A + 851968 | 0, 19) | 0;
		c[k >> 2] = z;
		if ((z | 0) < (x | 0)) {
			c[k >> 2] = x;
			E = l - x | 0;
			c[k + 4 >> 2] = E;
			z = x << 16 >> 16;
			z = Ph((E << 1) - x | 0, ($(A + 65536 >> 16, z) | 0) + (($(A & 65535, z) | 0) >> 16) | 0, 16) | 0;
			if ((z | 0) > 16384) A = 16384;
			else A = (z | 0) < 0 ? 0 : z
		} else {
			c[k + 4 >> 2] = l - z;
			A = 16384
		}
		z = d + 28 | 0;
		C = b[z >> 1] | 0;
		D = C & 65535;
		E = y << 16 >> 16;
		b[z >> 1] = D + (($(A - (C << 16 >> 16) >> 16, E) | 0) + (($(A - D & 65535, E) | 0) >>> 16));
		a[j >> 0] = 0;
		a: do
		if (!n) {
			y = (b[d + 30 >> 1] | 0) == 0;
			do
			if (y) {
				if ((l << 3 | 0) >= (x * 13 | 0)) {
					n = b[z >> 1] | 0;
					E = n << 16 >> 16;
					if ((($(w >> 16, E) | 0) + (($(w & 65535, E) | 0) >> 16) | 0) >= 819) {
						if (!y) {
							t = 25;
							break
						}
						n = b[z >> 1] | 0;
						break
					}
				} else n = b[z >> 1] | 0;
				t = n << 16 >> 16;
				c[s >> 2] = ($(t, u << 16 >> 16) | 0) >> 14;
				c[m >> 2] = ($(t, v << 16 >> 16) | 0) >> 14;
				ci(s, h);
				c[s >> 2] = 0;
				c[m >> 2] = 0;
				c[k >> 2] = l;
				c[k + 4 >> 2] = 0;
				a[j >> 0] = 1;
				h = 0;
				t = 33;
				break a
			} else t = 25;
			while (0);
			do
			if ((t | 0) == 25) {
				if ((l << 3 | 0) >= (x * 11 | 0)) {
					t = b[z >> 1] | 0;
					E = t << 16 >> 16;
					if ((($(w >> 16, E) | 0) + (($(w & 65535, E) | 0) >> 16) | 0) >= 328) {
						n = t;
						break
					}
				} else t = b[z >> 1] | 0;
				t = t << 16 >> 16;
				c[s >> 2] = ($(t, u << 16 >> 16) | 0) >> 14;
				c[m >> 2] = ($(t, v << 16 >> 16) | 0) >> 14;
				ci(s, h);
				c[s >> 2] = 0;
				c[m >> 2] = 0;
				h = 0;
				t = 32;
				break a
			}
			while (0);
			if (n << 16 >> 16 > 15565) {
				ci(s, h);
				h = 16384;
				t = 32;
				break
			} else {
				t = n << 16 >> 16;
				c[s >> 2] = ($(t, u << 16 >> 16) | 0) >> 14;
				c[m >> 2] = ($(t, v << 16 >> 16) | 0) >> 14;
				ci(s, h);
				h = b[z >> 1] | 0;
				t = 32;
				break
			}
		} else {
			c[s >> 2] = 0;
			c[m >> 2] = 0;
			ci(s, h);
			h = 0;
			t = 32
		}
		while (0);
		if ((t | 0) == 32) if ((a[j >> 0] | 0) == 1) t = 33;
		else {
			b[d + 32 >> 1] = 0;
			t = 37
		}
		do
		if ((t | 0) == 33) {
			t = d + 32 | 0;
			E = (e[t >> 1] | 0) + (p - (o << 3)) | 0;
			b[t >> 1] = E;
			if ((E << 16 >> 16 | 0) < (o * 5 | 0)) {
				a[j >> 0] = 0;
				t = 38;
				break
			} else {
				b[t >> 1] = 1e4;
				t = 37;
				break
			}
		}
		while (0);
		if ((t | 0) == 37) if (!(a[j >> 0] | 0)) t = 38;
		else k = h;
		if ((t | 0) == 38) {
			j = k + 4 | 0;
			if ((c[j >> 2] | 0) < 1) {
				c[j >> 2] = 1;
				c[k >> 2] = Qh(l + -1 | 0) | 0;
				k = h
			} else k = h
		}
		w = b[d >> 1] | 0;
		j = d + 2 | 0;
		x = b[j >> 1] | 0;
		t = d + 30 | 0;
		E = b[t >> 1] | 0;
		v = E << 16 >> 16;
		h = o << 3;
		s = c[s >> 2] | 0;
		l = (65536 / (h | 0) | 0) << 16 >> 16;
		n = (($(s - (w & 65535) << 16 >> 16, l) | 0) >> 15) + 1 >> 1;
		o = c[m >> 2] | 0;
		u = (($(o - (x & 65535) << 16 >> 16, l) | 0) >> 15) + 1 >> 1;
		l = ($(k - v >> 16, l) | 0) + (($(k - (E & 65535) & 65535, l) | 0) >> 16) << 10;
		w = 0 - (w << 16 >> 16) | 0;
		x = 0 - (x << 16 >> 16) | 0;
		m = 0;
		v = v << 10;
		while (1) {
			if ((m | 0) >= (h | 0)) break;
			w = w - n | 0;
			x = x - u | 0;
			v = v + l | 0;
			y = m + 1 | 0;
			E = b[f + (m + -1 << 1) >> 1] | 0;
			C = (b[f + (m + -2 << 1) >> 1] | 0) + (b[f + (m << 1) >> 1] | 0) + (E << 1) | 0;
			B = b[r + (y << 1) >> 1] | 0;
			D = w << 16 >> 16;
			z = x << 16 >> 16;
			z = (($(v >> 16, B) | 0) + (($(v & 64512, B) | 0) >> 16) + (($(C >> 7, D) | 0) + (($(C << 9 & 65024, D) | 0) >> 16)) + (($(E >> 5, z) | 0) + (($(E << 11 & 63488, z) | 0) >> 16)) >> 7) + 1 >> 1;
			if ((z | 0) > 32767) z = 32767;
			else z = (z | 0) < -32768 ? -32768 : z & 65535;
			b[g + (m + -1 << 1) >> 1] = z;
			m = y
		}
		u = k >> 6;
		m = k << 10 & 64512;
		n = 0 - s << 16 >> 16;
		l = 0 - o << 16 >> 16;
		while (1) {
			if ((h | 0) >= (p | 0)) break;
			v = h + 1 | 0;
			w = b[f + (h + -1 << 1) >> 1] | 0;
			E = (b[f + (h + -2 << 1) >> 1] | 0) + (b[f + (h << 1) >> 1] | 0) + (w << 1) | 0;
			D = b[r + (v << 1) >> 1] | 0;
			w = (($(u, D) | 0) + (($(m, D) | 0) >> 16) + (($(E >> 7, n) | 0) + (($(E << 9 & 65024, n) | 0) >> 16)) + (($(w >> 5, l) | 0) + (($(w << 11 & 63488, l) | 0) >> 16)) >> 7) + 1 >> 1;
			if ((w | 0) > 32767) w = 32767;
			else w = (w | 0) < -32768 ? -32768 : w & 65535;
			b[g + (h + -1 << 1) >> 1] = w;
			h = v
		}
		b[d >> 1] = s;
		b[j >> 1] = o;
		b[t >> 1] = k;
		i = q;
		return
	}
	function Ph(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		d = i;
		f = Rh((a | 0) > 0 ? a : 0 - a | 0) | 0;
		h = a << f + -1;
		e = (Rh((b | 0) > 0 ? b : 0 - b | 0) | 0) + -1 | 0;
		a = b << e;
		b = (536870911 / (a >> 16 | 0) | 0) << 16 >> 16;
		g = ($(h >> 16, b) | 0) + (($(h & 65535, b) | 0) >> 16) | 0;
		a = Gj(a | 0, ((a | 0) < 0) << 31 >> 31 | 0, g | 0, ((g | 0) < 0) << 31 >> 31 | 0) | 0;
		a = uj(a | 0, D | 0, 29) | 0;
		a = h - (a & -8) | 0;
		b = g + (($(a >> 16, b) | 0) + (($(a & 65535, b) | 0) >> 16)) | 0;
		c = f + 28 - e - c | 0;
		if ((c | 0) >= 0) {
			i = d;
			return ((c | 0) < 32 ? b >> c : 0) | 0
		}
		c = 0 - c | 0;
		a = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((a | 0) > (e | 0)) {
			if ((b | 0) > (a | 0)) {
				h = a;
				h = h << c;
				i = d;
				return h | 0
			}
			h = (b | 0) < (e | 0) ? e : b;
			h = h << c;
			i = d;
			return h | 0
		} else {
			if ((b | 0) > (e | 0)) {
				h = e;
				h = h << c;
				i = d;
				return h | 0
			}
			h = (b | 0) < (a | 0) ? a : b;
			h = h << c;
			i = d;
			return h | 0
		}
		return 0
	}
	function Qh(a) {
		a = a | 0;
		return ((a | 0) < 1 ? 1 : a) | 0
	}
	function Rh(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function Sh(a, d, f, g, h, j) {
		a = a | 0;
		d = d | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		k = i;
		l = a + 4 | 0;
		r = e[l >> 1] | e[l + 2 >> 1] << 16;
		b[d >> 1] = r;
		b[d + 2 >> 1] = r >>> 16;
		r = a + 8 | 0;
		q = e[r >> 1] | e[r + 2 >> 1] << 16;
		b[f >> 1] = q;
		b[f + 2 >> 1] = q >>> 16;
		q = d + (j << 1) | 0;
		q = e[q >> 1] | e[q + 2 >> 1] << 16;
		b[l >> 1] = q;
		b[l + 2 >> 1] = q >>> 16;
		l = f + (j << 1) | 0;
		l = e[l >> 1] | e[l + 2 >> 1] << 16;
		b[r >> 1] = l;
		b[r + 2 >> 1] = l >>> 16;
		r = b[a >> 1] | 0;
		l = a + 2 | 0;
		q = b[l >> 1] | 0;
		m = h << 3;
		n = (65536 / (m | 0) | 0) << 16 >> 16;
		p = (($((c[g >> 2] | 0) - (r & 65535) << 16 >> 16, n) | 0) >> 15) + 1 >> 1;
		h = g + 4 | 0;
		n = (($((c[h >> 2] | 0) - (q & 65535) << 16 >> 16, n) | 0) >> 15) + 1 >> 1;
		r = r << 16 >> 16;
		q = q << 16 >> 16;
		s = 0;
		while (1) {
			if ((s | 0) >= (m | 0)) break;
			r = r + p | 0;
			q = q + n | 0;
			o = s + 1 | 0;
			u = b[d + (o << 1) >> 1] | 0;
			w = (b[d + (s << 1) >> 1] | 0) + (b[d + (s + 2 << 1) >> 1] | 0) + (u << 1) | 0;
			s = f + (o << 1) | 0;
			v = r << 16 >> 16;
			t = q << 16 >> 16;
			t = ((b[s >> 1] << 8) + (($(w >> 7, v) | 0) + (($(w << 9 & 65024, v) | 0) >> 16)) + (($(u >> 5, t) | 0) + (($(u << 11 & 63488, t) | 0) >> 16)) >> 7) + 1 >> 1;
			if ((t | 0) > 32767) t = 32767;
			else t = (t | 0) < -32768 ? -32768 : t & 65535;
			b[s >> 1] = t;
			s = o
		}
		n = c[g >> 2] << 16 >> 16;
		o = c[h >> 2] << 16 >> 16;
		while (1) {
			if ((m | 0) >= (j | 0)) break;
			p = m + 1 | 0;
			q = b[d + (p << 1) >> 1] | 0;
			w = (b[d + (m << 1) >> 1] | 0) + (b[d + (m + 2 << 1) >> 1] | 0) + (q << 1) | 0;
			m = f + (p << 1) | 0;
			q = ((b[m >> 1] << 8) + (($(w >> 7, n) | 0) + (($(w << 9 & 65024, n) | 0) >> 16)) + (($(q >> 5, o) | 0) + (($(q << 11 & 63488, o) | 0) >> 16)) >> 7) + 1 >> 1;
			if ((q | 0) > 32767) q = 32767;
			else q = (q | 0) < -32768 ? -32768 : q & 65535;
			b[m >> 1] = q;
			m = p
		}
		b[a >> 1] = c[g >> 2];
		b[l >> 1] = c[h >> 2];
		g = 0;
		while (1) {
			if ((g | 0) >= (j | 0)) break;
			g = g + 1 | 0;
			h = d + (g << 1) | 0;
			w = b[h >> 1] | 0;
			l = f + (g << 1) | 0;
			a = b[l >> 1] | 0;
			m = w + a | 0;
			a = w - a | 0;
			if ((m | 0) > 32767) m = 32767;
			else m = (m | 0) < -32768 ? -32768 : m & 65535;
			b[h >> 1] = m;
			if ((a | 0) > 32767) a = 32767;
			else a = (a | 0) < -32768 ? -32768 : a & 65535;
			b[l >> 1] = a
		}
		i = k;
		return
	}
	function Th(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0;
		e = i;
		i = i + 32 | 0;
		f = e;
		h = sc(a, 24864, 8) | 0;
		g = (h | 0) / 5 | 0;
		c[f + 8 >> 2] = g;
		c[f + 20 >> 2] = h + ($(g, -5) | 0);
		g = 0;
		while (1) {
			if ((g | 0) >= 2) {
				g = 0;
				break
			}
			c[f + (g * 12 | 0) >> 2] = sc(a, 24984, 8) | 0;
			c[f + (g * 12 | 0) + 4 >> 2] = sc(a, 25e3, 8) | 0;
			g = g + 1 | 0
		}
		while (1) {
			if ((g | 0) >= 2) break;
			a = f + (g * 12 | 0) | 0;
			h = (c[a >> 2] | 0) + ((c[f + (g * 12 | 0) + 8 >> 2] | 0) * 3 | 0) | 0;
			c[a >> 2] = h;
			a = b[24832 + (h << 1) >> 1] | 0;
			h = b[24832 + (h + 1 << 1) >> 1] | 0;
			h = ($((h << 16 >> 16) - a >> 16, 429522944) | 0) + (((h & 65535) - a & 65535) * 6554 | 0) >> 16;
			c[d + (g << 2) >> 2] = a + ($(h, c[f + (g * 12 | 0) + 4 >> 2] << 17 >> 16 | 1) | 0);
			g = g + 1 | 0
		}
		c[d >> 2] = (c[d >> 2] | 0) - (c[d + 4 >> 2] | 0);
		i = e;
		return
	}
	function Uh(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0;
		d = i;
		c[b >> 2] = sc(a, 24896, 8) | 0;
		i = d;
		return
	}
	function Vh(b, c) {
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0;
		d = i;
		Cc(b, ((a[c + 2 >> 0] | 0) * 5 | 0) + (a[c + 5 >> 0] | 0) | 0, 24864, 8);
		e = 0;
		while (1) {
			if ((e | 0) >= 2) break;
			Cc(b, a[c + (e * 3 | 0) >> 0] | 0, 24984, 8);
			Cc(b, a[c + (e * 3 | 0) + 1 >> 0] | 0, 25e3, 8);
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function Wh(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		Cc(a, b << 24 >> 24, 24896, 8);
		i = c;
		return
	}
	function Xh(a, b, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		h = i;
		i = i + 16 | 0;
		j = h + 12 | 0;
		m = h + 8 | 0;
		n = h + 4 | 0;
		k = h;
		di(n, j, b, f);
		di(k, m, d, f);
		j = c[j >> 2] | 0;
		m = c[m >> 2] | 0;
		l = Yh(j, m) | 0;
		l = l + (l & 1) | 0;
		m = c[k >> 2] >> l - m;
		c[k >> 2] = m;
		j = Yh(c[n >> 2] >> l - j, 1) | 0;
		c[n >> 2] = j;
		f = mh(b, d, l, f) | 0;
		d = Zh(f, j, 13) | 0;
		if ((d | 0) > 16384) d = 16384;
		else d = (d | 0) < -16384 ? -16384 : d;
		o = d << 16 >> 16;
		p = ($(d >> 16, o) | 0) + (($(d & 65535, o) | 0) >> 16) | 0;
		n = Yh(g, (p | 0) > 0 ? p : 0 - p | 0) | 0;
		b = l >> 1;
		q = c[e >> 2] | 0;
		g = (_h(j) | 0) << b;
		n = n << 16 >> 16;
		g = $(g - (c[e >> 2] | 0) >> 16, n) | 0;
		l = (_h(j) | 0) << b;
		c[e >> 2] = q + (g + (($(l - (c[e >> 2] | 0) & 65535, n) | 0) >> 16));
		l = p << 16 >> 16;
		l = m - (($(f >> 16, o) | 0) + (($(f & 65535, o) | 0) >> 16) << 4) + (($(j >> 16, l) | 0) + (($(j & 65535, l) | 0) >> 16) << 6) | 0;
		c[k >> 2] = l;
		g = e + 4 | 0;
		m = c[g >> 2] | 0;
		f = (_h(l) | 0) << b;
		f = $(f - (c[g >> 2] | 0) >> 16, n) | 0;
		b = (_h(l) | 0) << b;
		n = m + (f + (($(b - (c[g >> 2] | 0) & 65535, n) | 0) >> 16)) | 0;
		c[g >> 2] = n;
		g = c[e >> 2] | 0;
		g = Zh(n, (g | 0) > 1 ? g : 1, 14) | 0;
		c[a >> 2] = g;
		if ((g | 0) > 32767) {
			q = 32767;
			c[a >> 2] = q;
			i = h;
			return d | 0
		}
		q = (g | 0) < 0 ? 0 : g;
		c[a >> 2] = q;
		i = h;
		return d | 0
	}
	function Yh(a, b) {
		a = a | 0;
		b = b | 0;
		return ((a | 0) > (b | 0) ? a : b) | 0
	}
	function Zh(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		d = i;
		f = ai((a | 0) > 0 ? a : 0 - a | 0) | 0;
		h = a << f + -1;
		e = (ai((b | 0) > 0 ? b : 0 - b | 0) | 0) + -1 | 0;
		a = b << e;
		b = (536870911 / (a >> 16 | 0) | 0) << 16 >> 16;
		g = ($(h >> 16, b) | 0) + (($(h & 65535, b) | 0) >> 16) | 0;
		a = Gj(a | 0, ((a | 0) < 0) << 31 >> 31 | 0, g | 0, ((g | 0) < 0) << 31 >> 31 | 0) | 0;
		a = uj(a | 0, D | 0, 29) | 0;
		a = h - (a & -8) | 0;
		b = g + (($(a >> 16, b) | 0) + (($(a & 65535, b) | 0) >> 16)) | 0;
		c = f + 28 - e - c | 0;
		if ((c | 0) >= 0) {
			i = d;
			return ((c | 0) < 32 ? b >> c : 0) | 0
		}
		c = 0 - c | 0;
		a = -2147483648 >> c;
		e = 2147483647 >>> c;
		if ((a | 0) > (e | 0)) {
			if ((b | 0) > (a | 0)) {
				h = a;
				h = h << c;
				i = d;
				return h | 0
			}
			h = (b | 0) < (e | 0) ? e : b;
			h = h << c;
			i = d;
			return h | 0
		} else {
			if ((b | 0) > (e | 0)) {
				h = e;
				h = h << c;
				i = d;
				return h | 0
			}
			h = (b | 0) < (a | 0) ? a : b;
			h = h << c;
			i = d;
			return h | 0
		}
		return 0
	}
	function _h(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b + 4 | 0;
		e = b;
		if ((a | 0) < 1) {
			e = 0;
			i = b;
			return e | 0
		}
		$h(a, d, e);
		d = c[d >> 2] | 0;
		d = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >> 1);
		e = ($(c[e >> 2] << 16 >> 16, 13959168) | 0) >> 16;
		e = d + (($(d >> 16, e) | 0) + (($(d & 65535, e) | 0) >> 16)) | 0;
		i = b;
		return e | 0
	}
	function $h(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = ai(a) | 0;
		c[b >> 2] = f;
		c[d >> 2] = (bi(a, 24 - f | 0) | 0) & 127;
		i = e;
		return
	}
	function ai(a) {
		a = a | 0;
		var b = 0;
		b = i;
		if (!a) a = 32;
		else a = vj(a | 0) | 0;
		i = b;
		return a | 0
	}
	function bi(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0;
		c = i;
		d = 0 - b | 0;
		do
		if (b) if ((b | 0) < 0) {
			a = a << d | a >>> (b + 32 | 0);
			break
		} else {
			a = a << 32 - b | a >>> b;
			break
		}
		while (0);
		i = c;
		return a | 0
	}
	function ci(d, e) {
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		j = i;
		p = 0;
		h = 0;
		while (1) {
			if ((h | 0) >= 2) break;
			f = d + (h << 2) | 0;
			g = e + (h * 3 | 0) | 0;
			k = e + (h * 3 | 0) + 1 | 0;
			q = 2147483647;
			o = 0;
			a: while (1) {
				if ((o | 0) >= 15) break;
				l = b[24832 + (o << 1) >> 1] | 0;
				n = o + 1 | 0;
				m = b[24832 + (n << 1) >> 1] | 0;
				m = ($((m << 16 >> 16) - l >> 16, 429522944) | 0) + (((m & 65535) - l & 65535) * 6554 | 0) >> 16;
				o = o & 255;
				r = 0;
				while (1) {
					if ((r | 0) >= 5) {
						o = n;
						continue a
					}
					t = l + ($(m, r << 17 >> 16 | 1) | 0) | 0;
					s = c[f >> 2] | 0;
					u = s - t | 0;
					s = (u | 0) > 0 ? u : t - s | 0;
					if ((s | 0) >= (q | 0)) break a;
					a[g >> 0] = o;
					a[k >> 0] = r;
					q = s;
					p = t;
					r = r + 1 | 0
				}
			}
			t = a[g >> 0] | 0;
			u = (t << 24 >> 24 | 0) / 3 | 0;
			a[e + (h * 3 | 0) + 2 >> 0] = u;
			a[g >> 0] = (t & 255) + ($(u << 24 >> 24, -3) | 0);
			c[f >> 2] = p;
			h = h + 1 | 0
		}
		c[d >> 2] = (c[d >> 2] | 0) - (c[d + 4 >> 2] | 0);
		i = j;
		return
	}
	function di(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		g = i;
		f = f + -1 | 0;
		l = 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (f | 0)) {
				k = 0;
				break
			}
			k = b[e + (h << 1) >> 1] | 0;
			k = l + ($(k, k) | 0) | 0;
			l = b[e + ((h | 1) << 1) >> 1] | 0;
			l = k + ($(l, l) | 0) | 0;
			if ((l | 0) < 0) {
				j = 4;
				break
			}
			h = h + 2 | 0
		}
		if ((j | 0) == 4) {
			h = h + 2 | 0;
			l = l >>> 2;
			k = 2
		}
		while (1) {
			if ((h | 0) >= (f | 0)) break;
			m = b[e + (h << 1) >> 1] | 0;
			m = $(m, m) | 0;
			j = b[e + (h + 1 << 1) >> 1] | 0;
			l = l + ((m + ($(j, j) | 0) | 0) >>> k) | 0;
			if ((l | 0) < 0) {
				l = l >>> 2;
				k = k + 2 | 0
			}
			h = h + 2 | 0
		}
		if ((h | 0) == (f | 0)) {
			m = b[e + (f << 1) >> 1] | 0;
			l = l + (($(m, m) | 0) >>> k) | 0
		}
		if (l >>> 0 <= 1073741823) {
			m = l;
			l = k;
			c[d >> 2] = l;
			c[a >> 2] = m;
			i = g;
			return
		}
		m = l >>> 2;
		l = k + 2 | 0;
		c[d >> 2] = l;
		c[a >> 2] = m;
		i = g;
		return
	}
	function ei(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0.0;
		e = i;
		h = a + 8504 | 0;
		k = c[h >> 2] | 0;
		j = c[a + 8500 >> 2] | 0;
		f = j - k | 0;
		f = (f | 0) < 0 ? f + 200 | 0 : f;
		if (!((d | 0) <= 480 | (k | 0) == (j | 0))) {
			k = k + 1 | 0;
			k = (k | 0) == 200 ? 0 : k
		}
		m = (k | 0) == (j | 0);
		j = j + -1 | 0;
		j = a + ((((m ? j : k) | 0) < 0 ? 199 : m ? j : k) * 28 | 0) + 8512 | 0;
		c[b + 0 >> 2] = c[j + 0 >> 2];
		c[b + 4 >> 2] = c[j + 4 >> 2];
		c[b + 8 >> 2] = c[j + 8 >> 2];
		c[b + 12 >> 2] = c[j + 12 >> 2];
		c[b + 16 >> 2] = c[j + 16 >> 2];
		c[b + 20 >> 2] = c[j + 20 >> 2];
		c[b + 24 >> 2] = c[j + 24 >> 2];
		j = a + 8508 | 0;
		d = (c[j >> 2] | 0) + ((d | 0) / 120 | 0) | 0;
		c[j >> 2] = d;
		while (1) {
			if ((d | 0) <= 3) break;
			m = d + -4 | 0;
			c[j >> 2] = m;
			c[h >> 2] = (c[h >> 2] | 0) + 1;
			d = m
		}
		d = c[h >> 2] | 0;
		if ((d | 0) > 199) c[h >> 2] = d + -200;
		h = f + -10 | 0;
		h = 200 - ((h | 0) > 0 ? h : 0) | 0;
		l = 0.0;
		f = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) break;
			l = l + +g[a + (f << 2) + 7684 >> 2];
			f = f + 1 | 0
		}
		while (1) {
			if ((f | 0) >= 200) break;
			n = l + +g[a + (f << 2) + 6884 >> 2];
			f = f + 1 | 0;
			l = n
		}
		g[b + 20 >> 2] = l * +g[a + 8488 >> 2] + (1.0 - l) * +g[a + 8484 >> 2];
		i = e;
		return
	}
	function fi(a, b, d, e, f, g, h, j, k, l, m, n) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0;
		o = i;
		if (!d) {
			c[n >> 2] = 0;
			ei(a, n, f);
			i = o;
			return
		}
		k = (k * 195 | 0) / 100 | 0;
		k = (k | 0) < (e | 0) ? k : e;
		e = a + 6880 | 0;
		q = c[e >> 2] | 0;
		p = q;
		q = k - q | 0;
		while (1) {
			gi(a, b, d, (q | 0) > 480 ? 480 : q, p, g, h, j, l, m);
			q = q + -480 | 0;
			if ((q | 0) <= 0) break;
			else p = p + 480 | 0
		}
		c[e >> 2] = k - f;
		c[n >> 2] = 0;
		ei(a, n, f);
		i = o;
		return
	}
	function gi(a, b, d, e, f, h, j, k, l, m) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0.0,
			v = 0,
			w = 0.0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0.0,
			D = 0.0,
			E = 0.0,
			F = 0.0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0.0,
			K = 0.0,
			L = 0.0,
			M = 0,
			R = 0.0,
			S = 0.0,
			T = 0.0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			_ = 0.0,
			$ = 0.0;
		n = i;
		i = i + 9888 | 0;
		z = n + 9816 | 0;
		v = n + 9744 | 0;
		t = n + 9712 | 0;
		s = n + 9608 | 0;
		r = n + 9600 | 0;
		M = n + 5760 | 0;
		x = n + 1920 | 0;
		y = n + 960 | 0;
		A = n;
		o = a + 6860 | 0;
		c[o >> 2] = (c[o >> 2] | 0) + 1;
		q = a + 6864 | 0;
		p = c[q >> 2] | 0;
		if ((p | 0) > 19) {
			u = 1.0 / 20.0;
			if ((p | 0) > 49) w = 50.0;
			else B = 4
		} else {
			u = 1.0 / +(p + 1 | 0);
			B = 4
		}
		if ((B | 0) == 4) w = +(p + 1 | 0);
		w = 1.0 / w;
		if ((p | 0) <= 999) {
			F = 1.0 / +(p + 1 | 0);
			if ((p | 0) < 4) {
				g[a + 6840 >> 2] = .5;
				V = c[b + 72 >> 2] | 0;
				if (!p) {
					c[a + 5760 >> 2] = 240;
					p = 240
				} else B = 10
			} else B = 8
		} else {
			F = 1.0 / 1.0e3;
			B = 8
		}
		if ((B | 0) == 8) {
			V = c[b + 72 >> 2] | 0;
			B = 10
		}
		if ((B | 0) == 10) p = c[a + 5760 >> 2] | 0;
		U = a + 5760 | 0;
		W = 720 - p | 0;
		Ca[m & 3](d, a + (p << 2) + 2880 | 0, (W | 0) > (e | 0) ? e : W, f, h, j, k);
		W = c[U >> 2] | 0;
		p = W + e | 0;
		if ((p | 0) < 720) {
			c[U >> 2] = p;
			i = n;
			return
		}
		X = a + 8500 | 0;
		b = c[X >> 2] | 0;
		p = a + (b * 28 | 0) + 8512 | 0;
		c[X >> 2] = (b | 0) > 198 ? b + -199 | 0 : b + 1 | 0;
		X = 0;
		while (1) {
			if ((X | 0) >= 240) break;
			T = +g[26352 + (X << 2) >> 2];
			g[M + (X << 3) >> 2] = T * +g[a + (X << 2) + 2880 >> 2];
			g[M + (X << 3) + 4 >> 2] = T * +g[a + (X + 240 << 2) + 2880 >> 2];
			Y = 480 - X + -1 | 0;
			g[M + (Y << 3) >> 2] = T * +g[a + (Y << 2) + 2880 >> 2];
			g[M + (Y << 3) + 4 >> 2] = T * +g[a + (720 - X + -1 << 2) + 2880 >> 2];
			X = X + 1 | 0
		}
		yj(a + 2880 | 0, a + 4800 | 0, 960) | 0;
		Y = W + -720 + e | 0;
		Ca[m & 3](d, a + 3840 | 0, Y, f + 720 - W | 0, h, j, k);
		c[U >> 2] = Y + 240;
		Qc(V, M, x);
		T = +g[x >> 2];
		if (T != T | 0.0 != 0.0) {
			c[p >> 2] = 0;
			i = n;
			return
		} else k = 1;
		while (1) {
			if ((k | 0) >= 240) break;
			J = +g[x + (k << 3) >> 2];
			W = 480 - k | 0;
			I = +g[x + (W << 3) >> 2];
			L = +g[x + (k << 3) + 4 >> 2];
			R = +g[x + (W << 3) + 4 >> 2];
			S = +hi(L - R, J + I) * .15915493667125702;
			W = a + (k << 2) | 0;
			T = S - +g[W >> 2];
			X = a + (k << 2) + 960 | 0;
			K = T - +g[X >> 2];
			R = +hi(I - J, L + R) * .15915493667125702;
			S = R - S;
			T = S - T;
			K = K - +N(+(K + .5));
			L = K * K;
			T = T - +N(+(T + .5));
			g[A + (k << 2) >> 2] = +O(+K) + +O(+T);
			T = T * T;
			T = T * T;
			Y = a + (k << 2) + 1920 | 0;
			g[y + (k << 2) >> 2] = 1.0 / ((+g[Y >> 2] + L * L * 2.0 + T) * .25 * 62341.81640625 + 1.0) + -.014999999664723873;
			g[W >> 2] = R;
			g[X >> 2] = S;
			g[Y >> 2] = T;
			k = k + 1 | 0
		}
		k = a + (b * 28 | 0) + 8528 | 0;
		g[k >> 2] = 0.0;
		a: do
		if (!(c[q >> 2] | 0)) {
			e = 0;
			while (1) {
				if ((e | 0) >= 18) break a;
				g[a + (e << 2) + 6416 >> 2] = 1.0e10;
				g[a + (e << 2) + 6488 >> 2] = -1.0e10;
				e = e + 1 | 0
			}
		}
		while (0);
		e = a + 6852 | 0;
		I = 0.0;
		H = 0.0;
		E = 0.0;
		J = 0.0;
		D = 0.0;
		G = 0.0;
		C = 0.0;
		d = 0;
		while (1) {
			if ((d | 0) >= 18) break;
			m = d + 1 | 0;
			f = c[27312 + (m << 2) >> 2] | 0;
			R = 0.0;
			S = 0.0;
			M = c[27312 + (d << 2) >> 2] | 0;
			K = 0.0;
			while (1) {
				if ((M | 0) >= (f | 0)) break;
				$ = +g[x + (M << 3) >> 2];
				Y = 480 - M | 0;
				_ = +g[x + (Y << 3) >> 2];
				T = +g[x + (M << 3) + 4 >> 2];
				L = +g[x + (Y << 3) + 4 >> 2];
				L = $ * $ + _ * _ + T * T + L * L;
				T = K + L * +g[y + (M << 2) >> 2];
				R = R + L;
				S = S + L * 2.0 * (.5 - +g[A + (M << 2) >> 2]);
				M = M + 1 | 0;
				K = T
			}
			if (!(R < 1.0e9) | (R != R | 0.0 != 0.0)) {
				B = 30;
				break
			}
			g[a + ((c[e >> 2] | 0) * 72 | 0) + (d << 2) + 5840 >> 2] = R;
			L = R + 1.0000000036274937e-15;
			H = H + S / L;
			R = R + 1.000000013351432e-10;
			I = I + +P(+R);
			R = +Z(+R);
			g[v + (d << 2) >> 2] = R;
			M = a + (d << 2) + 6416 | 0;
			T = +g[M >> 2] + .009999999776482582;
			T = R < T ? R : T;
			g[M >> 2] = T;
			f = a + (d << 2) + 6488 | 0;
			S = +g[f >> 2] + -.10000000149011612;
			S = R > S ? R : S;
			g[f >> 2] = S;
			if (S < T + 1.0) {
				S = S + .5;
				g[f >> 2] = S;
				T = T + -.5;
				g[M >> 2] = T
			}
			G = G + (R - T) / (S + 1.0000000036274937e-15 - T);
			R = 0.0;
			S = 0.0;
			f = 0;
			while (1) {
				if ((f | 0) >= 8) break;
				$ = +g[a + (f * 72 | 0) + (d << 2) + 5840 >> 2];
				R = R + +P(+$);
				S = S + $;
				f = f + 1 | 0
			}
			R = R / +P(+(S * 8.0 + 1.0e-15));
			R = R > .9900000095367432 ? .9900000095367432 : R;
			R = R * R;
			R = R * R;
			$ = K / L;
			f = a + (d << 2) + 5764 | 0;
			K = R * +g[f >> 2];
			K = $ > K ? $ : K;
			g[z + (d << 2) >> 2] = K;
			J = J + K;
			if ((d | 0) > 8) J = J - +g[z + (d + -9 << 2) >> 2];
			$ = (+(d + -18 | 0) * .029999999329447746 + 1.0) * J;
			g[f >> 2] = K;
			E = E + R;
			D = D > $ ? D : $;
			C = C + K * +(d + -8 | 0);
			d = m
		}
		if ((B | 0) == 30) {
			c[p >> 2] = 0;
			i = n;
			return
		}
		A = l + -8 | 0;
		J = .0005699999746866524 / +(1 << ((A | 0) < 0 ? 0 : A) | 0);
		J = J * J;
		F = 1.0 - F;
		A = 0;
		K = 0.0;
		R = 0.0;
		l = 0;
		while (1) {
			if ((l | 0) >= 21) break;
			z = c[27392 + (l << 2) >> 2] | 0;
			y = l + 1 | 0;
			B = c[27392 + (y << 2) >> 2] | 0;
			L = 0.0;
			m = z;
			while (1) {
				if ((m | 0) >= (B | 0)) break;
				S = +g[x + (m << 3) >> 2];
				Y = 480 - m | 0;
				T = +g[x + (Y << 3) >> 2];
				_ = +g[x + (m << 3) + 4 >> 2];
				$ = +g[x + (Y << 3) + 4 >> 2];
				L = L + (S * S + T * T + _ * _ + $ * $);
				m = m + 1 | 0
			}
			R = R > L ? R : L;
			Y = a + (l << 2) + 6560 | 0;
			$ = F * +g[Y >> 2];
			$ = $ > L ? $ : L;
			g[Y >> 2] = $;
			L = L > $ ? L : $;
			K = K * .05000000074505806;
			K = K > L ? K : L;
			if (!(L > K * .1 & L * 1.0e9 > R)) {
				Y = A;
				l = y;
				A = Y;
				continue
			}
			if (!(L > J * +(B - z | 0))) {
				Y = A;
				l = y;
				A = Y;
				continue
			}
			A = l;
			l = y
		}
		x = (c[q >> 2] | 0) < 3 ? 20 : A;
		_ = +la(+I) * 20.0;
		y = a + 6844 | 0;
		$ = +g[y >> 2] + -.029999999329447746;
		$ = $ > _ ? $ : _;
		g[y >> 2] = $;
		y = a + 6848 | 0;
		F = +g[y >> 2] * (1.0 - w);
		if (_ < $ + -30.0) F = F + w;
		g[y >> 2] = F;
		l = 0;
		while (1) {
			if ((l | 0) >= 8) break;
			z = l << 4;
			A = 0;
			w = 0.0;
			while (1) {
				if ((A | 0) >= 16) break;
				$ = w + +g[27480 + (z + A << 2) >> 2] * +g[v + (A << 2) >> 2];
				A = A + 1 | 0;
				w = $
			}
			g[t + (l << 2) >> 2] = w;
			l = l + 1 | 0
		}
		E = E / 18.0;
		w = H / 18.0;
		g[k >> 2] = w + (1.0 - w) * ((c[q >> 2] | 0) < 10 ? .5 : G / 18.0);
		_ = D / 9.0;
		v = a + 5836 | 0;
		$ = +g[v >> 2] * .800000011920929;
		$ = _ > $ ? _ : $;
		g[v >> 2] = $;
		v = a + (b * 28 | 0) + 8520 | 0;
		g[v >> 2] = C * .015625;
		c[e >> 2] = ((c[e >> 2] | 0) + 1 | 0) % 8 | 0;
		c[q >> 2] = (c[q >> 2] | 0) + 1;
		l = a + (b * 28 | 0) + 8516 | 0;
		g[l >> 2] = $;
		z = 0;
		while (1) {
			if ((z | 0) >= 4) break;
			g[s + (z << 2) >> 2] = (+g[t + (z << 2) >> 2] + +g[a + (z + 24 << 2) + 6644 >> 2]) * -.12298999726772308 + (+g[a + (z << 2) + 6644 >> 2] + +g[a + (z + 16 << 2) + 6644 >> 2]) * .49195000529289246 + +g[a + (z + 8 << 2) + 6644 >> 2] * .6969299912452698 - +g[a + (z << 2) + 6772 >> 2] * 1.4349000453948975;
			z = z + 1 | 0
		}
		C = 1.0 - u;
		z = 0;
		while (1) {
			if ((z | 0) >= 4) {
				z = 0;
				break
			}
			Y = a + (z << 2) + 6772 | 0;
			g[Y >> 2] = C * +g[Y >> 2] + u * +g[t + (z << 2) >> 2];
			z = z + 1 | 0
		}
		while (1) {
			if ((z | 0) >= 4) {
				z = 0;
				break
			}
			g[s + (z + 4 << 2) >> 2] = (+g[t + (z << 2) >> 2] - +g[a + (z + 24 << 2) + 6644 >> 2]) * .6324599981307983 + (+g[a + (z << 2) + 6644 >> 2] - +g[a + (z + 16 << 2) + 6644 >> 2]) * .31622999906539917;
			z = z + 1 | 0
		}
		while (1) {
			if ((z | 0) >= 3) break;
			Y = z + 8 | 0;
			g[s + (Y << 2) >> 2] = (+g[t + (z << 2) >> 2] + +g[a + (z + 24 << 2) + 6644 >> 2]) * .5345199704170227 - (+g[a + (z << 2) + 6644 >> 2] + +g[a + (z + 16 << 2) + 6644 >> 2]) * .26725998520851135 - +g[a + (Y << 2) + 6644 >> 2] * .5345199704170227;
			z = z + 1 | 0
		}
		b: do
		if ((c[q >> 2] | 0) > 5) {
			z = 0;
			while (1) {
				if ((z | 0) >= 9) {
					z = 0;
					break b
				}
				Y = a + (z << 2) + 6804 | 0;
				$ = +g[s + (z << 2) >> 2];
				g[Y >> 2] = C * +g[Y >> 2] + u * $ * $;
				z = z + 1 | 0
			}
		} else z = 0;
		while (0);
		while (1) {
			if ((z | 0) >= 8) {
				t = 0;
				break
			}
			Y = a + (z + 16 << 2) + 6644 | 0;
			g[a + (z + 24 << 2) + 6644 >> 2] = +g[Y >> 2];
			X = a + (z + 8 << 2) + 6644 | 0;
			g[Y >> 2] = +g[X >> 2];
			Y = a + (z << 2) + 6644 | 0;
			g[X >> 2] = +g[Y >> 2];
			g[Y >> 2] = +g[t + (z << 2) >> 2];
			z = z + 1 | 0
		}
		while (1) {
			if ((t | 0) >= 9) break;
			g[s + (t + 11 << 2) >> 2] = +P(+(+g[a + (t << 2) + 6804 >> 2]));
			t = t + 1 | 0
		}
		g[s + 80 >> 2] = +g[l >> 2];
		g[s + 84 >> 2] = +g[k >> 2];
		g[s + 88 >> 2] = E;
		g[s + 92 >> 2] = +g[v >> 2];
		g[s + 96 >> 2] = +g[y >> 2];
		ii(s, r);
		u = (+g[r >> 2] + 1.0) * .5;
		u = u * 1.2100000381469727 * u + .009999999776482582 - +Q(+u, 10.0) * .23000000417232513;
		Y = r + 4 | 0;
		C = +g[Y >> 2] * .5 + .5;
		g[Y >> 2] = C;
		u = C * u + (1.0 - C) * .5;
		g[r >> 2] = u;
		D = C * 4999999873689376.0e-20;
		if (!(u > .949999988079071)) if (u < .05000000074505806) H = .05000000074505806;
		else H = u;
		else H = .949999988079071;
		r = a + 6840 | 0;
		F = +g[r >> 2];
		if (!(F > .949999988079071)) if (F < .05000000074505806) G = .05000000074505806;
		else G = F;
		else G = .949999988079071;
		S = 1.0 - F;
		E = 1.0 - D;
		T = 1.0 - u;
		$ = +O(+(H - G)) * .05000000074505806 / (H * (1.0 - G) + G * (1.0 - H)) + .009999999776482582;
		_ = u;
		G = (F * E + S * D) * +Q(+_, +$);
		G = G / ((S * E + F * D) * +Q(+T, +$) + G);
		g[r >> 2] = G;
		g[a + (b * 28 | 0) + 8532 >> 2] = G;
		G = +Q(+T, +$);
		F = +Q(+_, +$);
		s = a + 6884 | 0;
		if ((c[q >> 2] | 0) == 1) {
			g[s >> 2] = .5;
			g[a + 7684 >> 2] = .5;
			H = .5;
			I = .5
		} else {
			H = +g[s >> 2];
			I = +g[a + 7684 >> 2]
		}
		H = H + +g[a + 6888 >> 2];
		I = I + +g[a + 7688 >> 2];
		g[a + 6884 >> 2] = H * E * G;
		g[a + 7684 >> 2] = I * E * F;
		q = 1;
		while (1) {
			if ((q | 0) >= 199) break;
			Y = q + 1 | 0;
			g[a + (q << 2) + 6884 >> 2] = +g[a + (Y << 2) + 6884 >> 2] * G;
			g[a + (q << 2) + 7684 >> 2] = +g[a + (Y << 2) + 7684 >> 2] * F;
			q = Y
		}
		g[a + 7680 >> 2] = I * D * G;
		g[a + 8480 >> 2] = H * D * F;
		D = 9.999999682655225e-21;
		q = 0;
		while (1) {
			if ((q | 0) >= 200) break;
			D = D + (+g[a + (q << 2) + 6884 >> 2] + +g[a + (q << 2) + 7684 >> 2]);
			q = q + 1 | 0
		}
		D = 1.0 / D;
		q = 0;
		while (1) {
			if ((q | 0) >= 200) {
				q = 1;
				break
			}
			Y = a + (q << 2) + 6884 | 0;
			g[Y >> 2] = +g[Y >> 2] * D;
			Y = a + (q << 2) + 7684 | 0;
			g[Y >> 2] = +g[Y >> 2] * D;
			q = q + 1 | 0
		}
		while (1) {
			if ((q | 0) >= 200) break;
			q = q + 1 | 0
		}
		if (C > .75) {
			C = +g[r >> 2];
			if (C > .9) {
				Y = a + 8496 | 0;
				X = (c[Y >> 2] | 0) + 1 | 0;
				c[Y >> 2] = X;
				c[Y >> 2] = (X | 0) < 500 ? X : 500;
				Y = a + 8488 | 0;
				_ = +g[Y >> 2];
				$ = u - _;
				g[Y >> 2] = _ + 1.0 / +(X | 0) * ($ < -.20000000298023224 ? -.20000000298023224 : $)
			}
			if (C < .1) {
				Y = a + 8492 | 0;
				X = (c[Y >> 2] | 0) + 1 | 0;
				c[Y >> 2] = X;
				c[Y >> 2] = (X | 0) < 500 ? X : 500;
				Y = a + 8484 | 0;
				_ = +g[Y >> 2];
				$ = u - _;
				g[Y >> 2] = _ + 1.0 / +(X | 0) * ($ > .20000000298023224 ? .20000000298023224 : $)
			}
		} else {
			if (!(c[a + 8496 >> 2] | 0)) g[a + 8488 >> 2] = .8999999761581421;
			if (!(c[a + 8492 >> 2] | 0)) g[a + 8484 >> 2] = .10000000149011612
		}
		q = a + 6856 | 0;
		r = +g[r >> 2] > .5 & 1;
		if ((c[q >> 2] | 0) != (r | 0)) c[o >> 2] = 0;
		c[q >> 2] = r;
		c[a + (b * 28 | 0) + 8536 >> 2] = x;
		g[a + (b * 28 | 0) + 8524 >> 2] = w;
		c[p >> 2] = 1;
		i = n;
		return
	}
	function hi(a, b) {
		a = +a;
		b = +b;
		var c = 0,
			d = 0.0,
			e = 0.0,
			f = 0.0;
		c = i;
		if (+O(+b) + +O(+a) < 9.999999717180685e-10) {
			a = a * 999999995904.0;
			b = b * 999999995904.0
		}
		d = b * b;
		e = a * a;
		if (d < e) {
			f = (e + d * .6784840226173401) * (e + d * .0859554186463356);
			if (f != 0.0) {
				f = -(b * a * (e + d * .43157973885536194)) / f + (a < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				i = c;
				return +f
			} else {
				f = a < 0.0 ? -1.5707963705062866 : 1.5707963705062866;
				i = c;
				return +f
			}
		} else {
			f = (d + e * .6784840226173401) * (d + e * .0859554186463356);
			if (f != 0.0) {
				b = b * a;
				f = b * (d + e * .43157973885536194) / f + (a < 0.0 ? -1.5707963705062866 : 1.5707963705062866) - (b < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				i = c;
				return +f
			} else {
				f = (a < 0.0 ? -1.5707963705062866 : 1.5707963705062866) - (b * a < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				i = c;
				return +f
			}
		}
		return 0.0
	}
	function ii(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0,
			h = 0,
			j = 0.0,
			k = 0,
			l = 0.0;
		d = i;
		i = i + 400 | 0;
		c = d;
		k = 28800;
		e = 0;
		while (1) {
			if ((e | 0) >= 15) {
				e = 0;
				break
			}
			h = k;
			f = 0;
			j = +g[k >> 2];
			while (1) {
				h = h + 4 | 0;
				if ((f | 0) >= 25) break;
				l = j + +g[a + (f << 2) >> 2] * +g[h >> 2];
				f = f + 1 | 0;
				j = l
			}
			g[c + (e << 2) >> 2] = +ji(j);
			k = h;
			e = e + 1 | 0
		}
		while (1) {
			if ((e | 0) >= 2) break;
			f = k;
			a = 0;
			j = +g[k >> 2];
			while (1) {
				k = f + 4 | 0;
				if ((a | 0) >= 15) break;
				l = j + +g[c + (a << 2) >> 2] * +g[k >> 2];
				f = k;
				a = a + 1 | 0;
				j = l
			}
			g[b + (e << 2) >> 2] = +ji(j);
			e = e + 1 | 0
		}
		i = d;
		return
	}
	function ji(a) {
		a = +a;
		var b = 0,
			c = 0.0,
			d = 0.0,
			e = 0;
		b = i;
		if (!(a < 8.0)) {
			a = 1.0;
			i = b;
			return +a
		}
		if (!(a > -8.0)) {
			a = -1.0;
			i = b;
			return +a
		}
		if (a != a | 0.0 != 0.0) {
			a = 0.0;
			i = b;
			return +a
		}
		if (a < 0.0) {
			a = -a;
			c = -1.0
		} else c = 1.0;
		e = ~~ + N(+(a * 25.0 + .5));
		a = a - +(e | 0) * .03999999910593033;
		d = +g[27992 + (e << 2) >> 2];
		a = c * (d + a * (1.0 - d * d) * (1.0 - d * a));
		i = b;
		return +a
	}
	function ki(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0;
		e = i;
		if ((c | 0) < 1 | (b | 0) < 1 | (a | 0) == 0 | (d | 0) == 0) {
			i = e;
			return
		}
		j = $(b, c) | 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (j | 0)) {
				f = 0;
				break
			}
			f = a + (h << 2) | 0;
			k = +g[f >> 2];
			if (!(k > 2.0)) {
				if (k < -2.0) k = -2.0
			} else k = 2.0;
			g[f >> 2] = k;
			h = h + 1 | 0
		}
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			j = a + (f << 2) | 0;
			h = d + (f << 2) | 0;
			q = +g[h >> 2];
			l = 0;
			while (1) {
				if ((l | 0) >= (b | 0)) break;
				m = a + (f + ($(l, c) | 0) << 2) | 0;
				o = +g[m >> 2];
				k = o * q;
				if (k >= 0.0) break;
				g[m >> 2] = o + k * o;
				l = l + 1 | 0
			}
			k = +g[j >> 2];
			n = 0;
			while (1) {
				m = n;
				while (1) {
					if ((m | 0) >= (b | 0)) break;
					t = +g[a + (f + ($(m, c) | 0) << 2) >> 2];
					if (t > 1.0 | t < -1.0) break;
					m = m + 1 | 0
				}
				if ((m | 0) == (b | 0)) {
					o = 0.0;
					break
				}
				q = +g[a + (f + ($(m, c) | 0) << 2) >> 2];
				o = +O(+q);
				p = m;
				while (1) {
					if ((p | 0) <= 0) {
						l = m;
						break
					}
					l = p + -1 | 0;
					if (!(q * +g[a + (f + ($(l, c) | 0) << 2) >> 2] >= 0.0)) {
						l = m;
						break
					} else p = l
				}
				while (1) {
					if ((l | 0) >= (b | 0)) break;
					s = +g[a + (f + ($(l, c) | 0) << 2) >> 2];
					if (!(q * s >= 0.0)) break;
					t = +O(+s);
					u = t > o;
					r = u ? l : m;
					l = l + 1 | 0;
					o = u ? t : o;
					m = r
				}
				if (!p) r = q * +g[j >> 2] >= 0.0;
				else r = 0;
				o = (o + -1.0) / (o * o);
				if (q > 0.0) o = -o;
				while (1) {
					if ((p | 0) >= (l | 0)) break;
					u = a + (f + ($(p, c) | 0) << 2) | 0;
					t = +g[u >> 2];
					g[u >> 2] = t + o * t * t;
					p = p + 1 | 0
				}
				a: do
				if (r & (m | 0) > 1) {
					s = k - +g[j >> 2];
					q = s / +(m | 0);
					while (1) {
						if ((n | 0) >= (m | 0)) break a;
						s = s - q;
						p = a + (f + ($(n, c) | 0) << 2) | 0;
						t = +g[p >> 2] + s;
						g[p >> 2] = t;
						if (!(t > 1.0)) {
							if (t < -1.0) t = -1.0
						} else t = 1.0;
						g[p >> 2] = t;
						n = n + 1 | 0
					}
				}
				while (0);
				if ((l | 0) == (b | 0)) break;
				else n = l
			}
			g[h >> 2] = o;
			f = f + 1 | 0
		}
		i = e;
		return
	}
	function li(b, c) {
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0;
		d = i;
		if ((b | 0) < 252) {
			a[c >> 0] = b;
			c = 1;
			i = d;
			return c | 0
		} else {
			e = b | 252;
			a[c >> 0] = e;
			a[c + 1 >> 0] = (b - (e & 255) | 0) >>> 2;
			c = 2;
			i = d;
			return c | 0
		}
		return 0
	}
	function mi(b, c) {
		b = b | 0;
		c = c | 0;
		var d = 0;
		d = i;
		b = a[b >> 0] | 0;
		do
		if (b << 24 >> 24 >= 0) if ((b & 96) == 96) if (!(b & 8)) {
			c = (c | 0) / 100 | 0;
			break
		} else {
			c = (c | 0) / 50 | 0;
			break
		} else {
			b = (b & 255) >>> 3 & 3;
			if ((b | 0) == 3) {
				c = (c * 60 | 0) / 1e3 | 0;
				break
			} else {
				c = (c << b | 0) / 100 | 0;
				break
			}
		} else c = (c << ((b & 255) >>> 3 & 3) | 0) / 400 | 0;
		while (0);
		i = d;
		return c | 0
	}
	function ni(d, e, f, g, h, j, k, l) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0;
		m = i;
		if (!j) {
			e = -1;
			i = m;
			return e | 0
		}
		N = mi(d, 48e3) | 0;
		C = d + 1 | 0;
		n = a[d >> 0] | 0;
		I = e + -1 | 0;
		M = n & 3;
		a: do
		if ((M | 0) == 1) if (!f) if (!(I & 1)) {
			F = (I | 0) / 2 | 0;
			b[j >> 1] = F;
			A = C;
			y = I;
			z = 1;
			B = 2;
			D = 0;
			N = 30;
			break
		} else {
			e = -4;
			i = m;
			return e | 0
		} else {
			s = C;
			t = I;
			r = 1;
			p = 2;
			q = I;
			o = 0;
			N = 31
		} else if (!M) {
			A = C;
			y = I;
			z = 0;
			B = 1;
			F = I;
			D = 0;
			N = 30
		} else if ((M | 0) == 2) {
			y = oi(C, I, j) | 0;
			x = I - y | 0;
			z = b[j >> 1] | 0;
			if (z << 16 >> 16 < 0) {
				e = -4;
				i = m;
				return e | 0
			}
			C = z << 16 >> 16;
			if ((C | 0) > (x | 0)) {
				e = -4;
				i = m;
				return e | 0
			} else {
				A = d + (y + 1) | 0;
				y = x;
				z = 0;
				B = 2;
				F = x - C | 0;
				D = 0;
				N = 30;
				break
			}
		} else {
			if ((e | 0) < 2) {
				e = -4;
				i = m;
				return e | 0
			}
			O = d + 2 | 0;
			M = a[C >> 0] | 0;
			C = M & 63;
			if (!C) {
				e = -4;
				i = m;
				return e | 0
			}
			if (($(N, C) | 0) > 5760) {
				e = -4;
				i = m;
				return e | 0
			}
			N = e + -2 | 0;
			do
			if (M & 64) {
				e = 0;
				while (1) {
					if ((N | 0) < 1) {
						E = -4;
						N = 51;
						break
					}
					K = O + 1 | 0;
					J = a[O >> 0] | 0;
					L = N + -1 | 0;
					if (J << 24 >> 24 != -1) {
						N = 16;
						break
					}
					O = K;
					N = L - 254 | 0;
					e = e + 254 | 0
				}
				if ((N | 0) == 16) {
					x = J & 255;
					H = K;
					G = L - x | 0;
					x = e + x | 0;
					break
				} else if ((N | 0) == 51) {
					i = m;
					return E | 0
				}
			} else {
				H = O;
				G = N;
				x = 0
			}
			while (0);
			if ((G | 0) < 0) {
				e = -4;
				i = m;
				return e | 0
			}
			e = (M & 255) >>> 7;
			J = e & 255 ^ 1;
			if (e << 24 >> 24 != 1) {
				if (f) {
					s = H;
					t = G;
					r = J;
					p = C;
					q = I;
					o = x;
					N = 31;
					break
				}
				F = (G | 0) / (C | 0) | 0;
				if (($(F, C) | 0) != (G | 0)) {
					e = -4;
					i = m;
					return e | 0
				}
				y = C + -1 | 0;
				A = F & 65535;
				z = 0;
				while (1) {
					if ((z | 0) >= (y | 0)) {
						A = H;
						y = G;
						z = J;
						B = C;
						D = x;
						N = 30;
						break a
					}
					b[j + (z << 1) >> 1] = A;
					z = z + 1 | 0
				}
			}
			I = C + -1 | 0;
			K = G;
			M = 0;
			while (1) {
				if ((M | 0) >= (I | 0)) {
					N = 24;
					break
				}
				O = j + (M << 1) | 0;
				L = oi(H, K, O) | 0;
				N = K - L | 0;
				O = b[O >> 1] | 0;
				if (O << 16 >> 16 < 0) {
					E = -4;
					N = 51;
					break
				}
				O = O << 16 >> 16;
				if ((O | 0) > (N | 0)) {
					E = -4;
					N = 51;
					break
				}
				H = H + L | 0;
				K = N;
				G = G - (L + O) | 0;
				M = M + 1 | 0
			}
			if ((N | 0) == 24) {
				if ((G | 0) < 0) E = -4;
				else {
					A = H;
					y = K;
					z = J;
					B = C;
					F = G;
					D = x;
					N = 30;
					break
				}
				i = m;
				return E | 0
			} else if ((N | 0) == 51) {
				i = m;
				return E | 0
			}
		}
		while (0);
		do
		if ((N | 0) == 30) if (!f) if ((F | 0) > 1275) {
			e = -4;
			i = m;
			return e | 0
		} else {
			b[j + (B + -1 << 1) >> 1] = F;
			w = A;
			u = B;
			v = D;
			break
		} else {
			s = A;
			t = y;
			r = z;
			p = B;
			q = F;
			o = D;
			N = 31
		}
		while (0);
		b: do
		if ((N | 0) == 31) {
			v = p + -1 | 0;
			u = j + (v << 1) | 0;
			f = oi(s, t, u) | 0;
			t = t - f | 0;
			w = b[u >> 1] | 0;
			if (w << 16 >> 16 < 0) {
				e = -4;
				i = m;
				return e | 0
			}
			x = w << 16 >> 16;
			if ((x | 0) > (t | 0)) {
				e = -4;
				i = m;
				return e | 0
			}
			w = s + f | 0;
			if (!r) {
				if ((f + x | 0) > (q | 0)) E = -4;
				else {
					u = p;
					v = o;
					break
				}
				i = m;
				return E | 0
			}
			if (($(x, p) | 0) > (t | 0)) {
				e = -4;
				i = m;
				return e | 0
			} else q = 0;
			while (1) {
				if ((q | 0) >= (v | 0)) {
					u = p;
					v = o;
					break b
				}
				b[j + (q << 1) >> 1] = b[u >> 1] | 0;
				q = q + 1 | 0
			}
		}
		while (0);
		if (k) c[k >> 2] = w - d;
		o = (h | 0) == 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (u | 0)) break;
			if (!o) c[h + (p << 2) >> 2] = w;
			w = w + (b[j + (p << 1) >> 1] | 0) | 0;
			p = p + 1 | 0
		}
		if (l) c[l >> 2] = v + (w - d);
		if (!g) {
			e = u;
			i = m;
			return e | 0
		}
		a[g >> 0] = n;
		e = u;
		i = m;
		return e | 0
	}
	function oi(c, e, f) {
		c = c | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0;
		g = i;
		do
		if ((e | 0) >= 1) {
			h = a[c >> 0] | 0;
			if ((h & 255) < 252) {
				b[f >> 1] = h & 255;
				f = 1;
				break
			}
			if ((e | 0) < 2) {
				b[f >> 1] = -1;
				f = -1;
				break
			} else {
				b[f >> 1] = ((d[c + 1 >> 0] | 0) << 2) + (h & 255);
				f = 2;
				break
			}
		} else {
			b[f >> 1] = -1;
			f = -1
		}
		while (0);
		i = g;
		return f | 0
	}
	function pi(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b;
		if ((a | 0) < 1 | (a | 0) > 2) {
			d = 0;
			i = b;
			return d | 0
		}
		if (yf(d) | 0) {
			d = 0;
			i = b;
			return d | 0
		}
		e = qi(c[d >> 2] | 0) | 0;
		c[d >> 2] = e;
		d = rb(a) | 0;
		d = (qi(88) | 0) + e + d | 0;
		i = b;
		return d | 0
	}
	function qi(a) {
		a = a | 0;
		return a + 3 & -4 | 0
	}
	function ri(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0;
		e = i;
		i = i + 16 | 0;
		f = e;
		g = e + 4 | 0;
		if (!((b | 0) == 8e3 | (b | 0) == 12e3 | (b | 0) == 16e3 | (b | 0) == 24e3 | (b | 0) == 48e3)) {
			g = -1;
			i = e;
			return g | 0
		}
		if ((d + -1 | 0) >>> 0 >= 2) {
			g = -1;
			i = e;
			return g | 0
		}
		wj(a | 0, 0, pi(d) | 0) | 0;
		if (yf(g) | 0) {
			g = -3;
			i = e;
			return g | 0
		}
		j = qi(c[g >> 2] | 0) | 0;
		c[g >> 2] = j;
		h = qi(88) | 0;
		c[a + 4 >> 2] = h;
		g = h + j | 0;
		c[a >> 2] = g;
		g = a + g | 0;
		c[a + 8 >> 2] = d;
		c[a + 44 >> 2] = d;
		c[a + 12 >> 2] = b;
		c[a + 24 >> 2] = b;
		c[a + 16 >> 2] = d;
		if (zf(a + h | 0) | 0) {
			j = -3;
			i = e;
			return j | 0
		}
		if (tb(g, b, d) | 0) {
			j = -3;
			i = e;
			return j | 0
		}
		c[f >> 2] = 0;
		Cb(g, 10016, f);
		c[a + 56 >> 2] = 0;
		c[a + 60 >> 2] = (b | 0) / 400 | 0;
		c[a + 84 >> 2] = 0;
		j = 0;
		i = e;
		return j | 0
	}
	function si(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		f = i;
		do
		if ((a | 0) == 8e3 | (a | 0) == 12e3 | (a | 0) == 16e3 | (a | 0) == 24e3 | (a | 0) == 48e3 ? (b + -1 | 0) >>> 0 < 2 : 0) {
			g = ti(pi(b) | 0) | 0;
			if (!g) {
				if (!d) {
					g = 0;
					break
				}
				c[d >> 2] = -7;
				g = 0;
				break
			}
			a = ri(g, a, b) | 0;
			if (d) c[d >> 2] = a;
			if (a) {
				ui(g);
				g = 0
			}
		} else e = 3;
		while (0);
		if ((e | 0) == 3) if (!d) g = 0;
		else {
			c[d >> 2] = -1;
			g = 0
		}
		i = f;
		return g | 0
	}
	function ti(a) {
		a = a | 0;
		var b = 0;
		b = i;
		a = qj(a) | 0;
		i = b;
		return a | 0
	}
	function ui(a) {
		a = a | 0;
		var b = 0;
		b = i;
		rj(a);
		i = b;
		return
	}
	function vi(d, e, f, h, j, k, l) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0;
		m = i;
		i = i + 112 | 0;
		w = m;
		x = m + 104 | 0;
		n = m + 8 | 0;
		if ((k | 0) < 0 | (k | 0) > 1) {
			x = -1;
			i = m;
			return x | 0
		}
		v = (k | 0) == 0;
		if (v ^ 1 | (f | 0) == 0 | (e | 0) == 0 ? ((j | 0) % ((c[d + 12 >> 2] | 0) / 400 | 0 | 0) | 0 | 0) != 0 : 0) {
			x = -1;
			i = m;
			return x | 0
		}
		if ((f | 0) == 0 | (e | 0) == 0) {
			n = d + 8 | 0;
			q = 0;
			do {
				l = wi(d, 0, 0, h + (($(q, c[n >> 2] | 0) | 0) << 2) | 0, j - q | 0, 0) | 0;
				if ((l | 0) < 0) {
					o = l;
					p = 28;
					break
				}
				q = q + l | 0
			} while ((q | 0) < (j | 0));
			if ((p | 0) == 28) {
				i = m;
				return o | 0
			}
			c[d + 68 >> 2] = q;
			x = q;
			i = m;
			return x | 0
		}
		if ((f | 0) < 0) {
			x = -1;
			i = m;
			return x | 0
		}
		t = xi(e) | 0;
		s = yi(e) | 0;
		k = mi(e, c[d + 12 >> 2] | 0) | 0;
		u = zi(a[e >> 0] | 0) | 0;
		f = ni(e, f, 0, x, 0, n, w, 0) | 0;
		if ((f | 0) < 0) {
			x = f;
			i = m;
			return x | 0
		}
		e = e + (c[w >> 2] | 0) | 0;
		if (v) {
			if (($(f, k) | 0) > (j | 0)) {
				x = -2;
				i = m;
				return x | 0
			}
			c[d + 52 >> 2] = t;
			c[d + 48 >> 2] = s;
			c[d + 60 >> 2] = k;
			c[d + 44 >> 2] = u;
			q = d + 8 | 0;
			t = 0;
			r = 0;
			while (1) {
				if ((r | 0) >= (f | 0)) break;
				s = n + (r << 1) | 0;
				k = wi(d, e, b[s >> 1] | 0, h + (($(t, c[q >> 2] | 0) | 0) << 2) | 0, j - t | 0, 0) | 0;
				if ((k | 0) < 0) {
					o = k;
					p = 28;
					break
				}
				e = e + (b[s >> 1] | 0) | 0;
				t = t + k | 0;
				r = r + 1 | 0
			}
			if ((p | 0) == 28) {
				i = m;
				return o | 0
			}
			c[d + 68 >> 2] = t;
			if (!l) {
				g[d + 76 >> 2] = 0.0;
				g[d + 72 >> 2] = 0.0;
				x = t;
				i = m;
				return x | 0
			} else {
				ki(h, t, c[q >> 2] | 0, d + 72 | 0);
				x = t;
				i = m;
				return x | 0
			}
		} else {
			if (!((k | 0) > (j | 0) | (t | 0) == 1002) ? (q = d + 52 | 0, (c[q >> 2] | 0) != 1002) : 0) {
				o = d + 68 | 0;
				f = c[o >> 2] | 0;
				p = j - k | 0;
				if ((k | 0) != (j | 0) ? (r = vi(d, 0, 0, h, p, 0, l) | 0, (r | 0) < 0) : 0) {
					c[o >> 2] = f;
					x = r;
					i = m;
					return x | 0
				}
				c[q >> 2] = t;
				c[d + 48 >> 2] = s;
				c[d + 60 >> 2] = k;
				c[d + 44 >> 2] = u;
				d = wi(d, e, b[n >> 1] | 0, h + (($(c[d + 8 >> 2] | 0, p) | 0) << 2) | 0, k, 1) | 0;
				if ((d | 0) < 0) {
					x = d;
					i = m;
					return x | 0
				}
				c[o >> 2] = j;
				x = j;
				i = m;
				return x | 0
			}
			x = vi(d, 0, 0, h, j, 0, l) | 0;
			i = m;
			return x | 0
		}
		return 0
	}
	function wi(a, d, e, f, h, j) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0.0;
		k = i;
		i = i + 80 | 0;
		q = k;
		l = k + 16 | 0;
		B = k + 12 | 0;
		m = k + 8 | 0;
		u = k + 64 | 0;
		s = k + 4 | 0;
		c[m >> 2] = 0;
		A = a + (c[a + 4 >> 2] | 0) | 0;
		r = a + (c[a >> 2] | 0) | 0;
		o = a + 12 | 0;
		v = c[o >> 2] | 0;
		t = (v | 0) / 50 | 0;
		F = t >> 1;
		p = t >> 2;
		n = t >> 3;
		if ((n | 0) > (h | 0)) {
			P = -2;
			i = k;
			return P | 0
		}
		y = ((v | 0) / 25 | 0) * 3 | 0;
		y = (y | 0) > (h | 0) ? h : y;
		if ((e | 0) >= 2) {
			G = (d | 0) == 0;
			if (G) w = 6;
			else {
				x = c[a + 60 >> 2] | 0;
				h = c[a + 52 >> 2] | 0;
				kc(l, d, e);
				w = 20
			}
		} else {
			G = c[a + 60 >> 2] | 0;
			d = 0;
			y = (y | 0) < (G | 0) ? y : G;
			G = 1;
			w = 6
		}
		do
		if ((w | 0) == 6) {
			h = c[a + 56 >> 2] | 0;
			if (!h) {
				a = a + 8 | 0;
				l = 0;
				while (1) {
					if ((l | 0) >= ($(y, c[a >> 2] | 0) | 0)) break;
					g[f + (l << 2) >> 2] = 0.0;
					l = l + 1 | 0
				}
				i = k;
				return y | 0
			}
			if ((y | 0) > (t | 0)) {
				l = a + 8 | 0;
				n = y;
				while (1) {
					m = wi(a, 0, 0, f, (n | 0) < (t | 0) ? n : t, 0) | 0;
					if ((m | 0) < 0) {
						y = m;
						w = 115;
						break
					}
					f = f + (($(m, c[l >> 2] | 0) | 0) << 2) | 0;
					n = n - m | 0;
					if ((n | 0) <= 0) {
						w = 115;
						break
					}
				}
				if ((w | 0) == 115) {
					i = k;
					return y | 0
				}
			}
			if ((y | 0) < (t | 0)) if ((y | 0) <= (F | 0)) if ((h | 0) != 1e3) if ((y | 0) > (p | 0) & (y | 0) < (F | 0)) if (G) {
				x = p;
				w = 27;
				break
			} else {
				x = p;
				w = 20;
				break
			} else x = y;
			else {
				x = y;
				h = 1e3
			} else x = F;
			else x = y;
			if (G) w = 27;
			else w = 20
		}
		while (0);
		do
		if ((w | 0) == 20) {
			z = c[a + 56 >> 2] | 0;
			if ((z | 0) > 0) {
				v = (h | 0) == 1002;
				z = (z | 0) == 1002;
				if (v) {
					if (z) {
						w = 27;
						break
					}
					if (c[a + 64 >> 2] | 0) {
						w = 27;
						break
					}
					if (v) {
						E = $(p, c[a + 8 >> 2] | 0) | 0;
						v = ta() | 0;
						D = i;
						i = i + ((4 * E | 0) + 15 & -16) | 0;
						E = 1
					} else w = 28
				} else if (z) w = 28;
				else {
					w = 27;
					break
				}
				if ((w | 0) == 28) {
					E = $(p, c[a + 8 >> 2] | 0) | 0;
					v = ta() | 0;
					D = i;
					i = i + 16 | 0;
					if ((h | 0) != 1002) {
						z = 0;
						D = 0;
						C = 1;
						break
					}
				}
				wi(a, 0, 0, D, (p | 0) < (x | 0) ? p : x, 0) | 0;
				z = 0;
				C = 1
			} else w = 27
		}
		while (0);
		if ((w | 0) == 27) {
			v = ta() | 0;
			z = 1;
			D = 0;
			E = 1;
			C = 0
		}
		a: do
		if ((x | 0) > (y | 0)) a = -1;
		else {
			y = (h | 0) == 1002;
			if (y) {
				A = i;
				i = i + 16 | 0
			} else {
				P = $((F | 0) > (x | 0) ? F : x, c[a + 8 >> 2] | 0) | 0;
				F = i;
				i = i + ((2 * P | 0) + 15 & -16) | 0;
				if ((c[a + 56 >> 2] | 0) == 1002) zf(A) | 0;
				P = (x * 1e3 | 0) / (c[o >> 2] | 0) | 0;
				c[a + 32 >> 2] = (P | 0) < 10 ? 10 : P;
				if (G) H = 1;
				else {
					c[a + 20 >> 2] = c[a + 44 >> 2];
					do
					if ((h | 0) == 1e3) {
						H = c[a + 48 >> 2] | 0;
						if ((H | 0) == 1101) {
							c[a + 28 >> 2] = 8e3;
							break
						} else if ((H | 0) == 1102) {
							c[a + 28 >> 2] = 12e3;
							break
						} else if ((H | 0) == 1103) {
							c[a + 28 >> 2] = 16e3;
							break
						} else {
							c[a + 28 >> 2] = 16e3;
							break
						}
					} else c[a + 28 >> 2] = 16e3;
					while (0);
					H = j << 1
				}
				N = a + 16 | 0;
				M = a + 84 | 0;
				J = a + 8 | 0;
				I = (H | 0) == 0;
				K = 0;
				L = F;
				while (1) {
					b: do
					if (!(Af(A, N, H, (K | 0) == 0 & 1, l, L, B, c[M >> 2] | 0) | 0)) P = c[J >> 2] | 0;
					else {
						if (I) {
							a = -3;
							break a
						}
						c[B >> 2] = x;
						O = 0;
						while (1) {
							P = c[J >> 2] | 0;
							if ((O | 0) >= ($(x, P) | 0)) break b;
							b[L + (O << 1) >> 1] = 0;
							O = O + 1 | 0
						}
					}
					while (0);
					O = c[B >> 2] | 0;
					L = L + (($(O, P) | 0) << 1) | 0;
					K = K + O | 0;
					if ((K | 0) >= (x | 0)) {
						A = F;
						break
					}
				}
			}
			B = (j | 0) == 0;
			do
			if (B) if (!y) if (!G) {
				G = l + 20 | 0;
				H = l + 28 | 0;
				P = (Ii(c[G >> 2] | 0, c[H >> 2] | 0) | 0) + 17 | 0;
				if ((P + ((c[a + 52 >> 2] | 0) == 1001 ? 20 : 0) | 0) > (e << 3 | 0)) {
					j = 0;
					F = 0;
					G = 0;
					w = 61
				} else {
					if ((h | 0) == 1001) {
						F = rc(l, 12) | 0;
						if (!F) {
							j = 0;
							F = 0;
							G = 0;
							w = 61;
							break
						}
						j = rc(l, 1) | 0;
						w = (tc(l, 256) | 0) + 2 | 0;
						G = c[G >> 2] | 0;
						H = c[H >> 2] | 0
					} else {
						j = rc(l, 1) | 0;
						G = c[G >> 2] | 0;
						H = c[H >> 2] | 0;
						w = e - ((Ii(G, H) | 0) + 7 >> 3) | 0;
						F = 1
					}
					e = e - w | 0;
					P = (e << 3 | 0) < (Ii(G, H) | 0);
					G = P ? 0 : w;
					w = l + 4 | 0;
					c[w >> 2] = (c[w >> 2] | 0) - G;
					e = P ? 0 : e;
					F = P ? 0 : F;
					w = 61
				}
			} else {
				j = 0;
				F = 0;
				G = 0;
				w = 62
			} else {
				j = 0;
				F = 0;
				G = 0;
				H = 0
			} else {
				j = 0;
				F = 0;
				G = 0;
				w = 61
			}
			while (0);
			if ((w | 0) == 61) if (y) H = 0;
			else w = 62;
			if ((w | 0) == 62) H = 17;
			I = c[a + 48 >> 2] | 0;
			if ((I | 0) == 1103 | (I | 0) == 1102) I = 17;
			else if ((I | 0) == 1104) I = 19;
			else if ((I | 0) == 1101) I = 13;
			else I = 21;
			c[q >> 2] = I;
			Cb(r, 10012, q);
			c[q >> 2] = c[a + 44 >> 2];
			Cb(r, 10008, q);
			F = (F | 0) == 0;
			do
			if (F) {
				I = i;
				i = i + ((4 * E | 0) + 15 & -16) | 0;
				if (!z) {
					if (!y) {
						wi(a, 0, 0, I, (p | 0) < (x | 0) ? p : x, 0) | 0;
						D = I
					}
					if (!F) {
						w = 73;
						break
					}
				} else C = 0;
				z = i;
				i = i + 16 | 0
			} else {
				C = 0;
				w = 73
			}
			while (0);
			if ((w | 0) == 73) {
				P = $(p, c[a + 8 >> 2] | 0) | 0;
				z = i;
				i = i + ((4 * P | 0) + 15 & -16) | 0;
				if (j) {
					c[q >> 2] = 0;
					Cb(r, 10010, q);
					vb(r, d + e | 0, G, z, p, 0, 0) | 0;
					c[q >> 2] = m;
					Cb(r, 4031, q)
				}
			}
			c[q >> 2] = H;
			Cb(r, 10010, q);
			do
			if ((h | 0) == 1e3) {
				b[u >> 1] = -1;
				t = a + 8 | 0;
				w = 0;
				while (1) {
					if ((w | 0) >= ($(x, c[t >> 2] | 0) | 0)) break;
					g[f + (w << 2) >> 2] = 0.0;
					w = w + 1 | 0
				}
				if ((c[a + 56 >> 2] | 0) == 1001) {
					if (!(F | (j | 0) == 0) ? (c[a + 64 >> 2] | 0) != 0 : 0) {
						t = 0;
						break
					}
					c[q >> 2] = 0;
					Cb(r, 10010, q);
					vb(r, u, 2, f, n, 0, 0) | 0;
					t = 0
				} else t = 0
			} else {
				t = (t | 0) < (x | 0) ? t : x;
				P = c[a + 56 >> 2] | 0;
				if ((h | 0) != (P | 0) & (P | 0) > 0 ? (c[a + 64 >> 2] | 0) == 0 : 0) Cb(r, 4028, q);
				t = vb(r, B ? d : 0, e, f, t, l, 0) | 0
			}
			while (0);
			c: do
			if (!y) {
				u = a + 8 | 0;
				w = 0;
				while (1) {
					if ((w | 0) >= ($(x, c[u >> 2] | 0) | 0)) break c;
					P = f + (w << 2) | 0;
					g[P >> 2] = +g[P >> 2] + +(b[A + (w << 1) >> 1] | 0) * 30517578125.0e-15;
					w = w + 1 | 0
				}
			}
			while (0);
			c[q >> 2] = s;
			Cb(r, 10015, q);
			s = c[(c[s >> 2] | 0) + 60 >> 2] | 0;
			do
			if (!F) {
				if (!j) {
					Cb(r, 4028, q);
					c[q >> 2] = 0;
					Cb(r, 10010, q);
					vb(r, d + e | 0, G, z, p, 0, 0) | 0;
					c[q >> 2] = m;
					Cb(r, 4031, q);
					P = c[a + 8 >> 2] | 0;
					O = f + (($(P, x - n | 0) | 0) << 2) | 0;
					N = z + (($(P, n) | 0) << 2) | 0;
					Ji(O, N, O, n, P, s, c[o >> 2] | 0);
					break
				}
				q = a + 8 | 0;
				r = 0;
				while (1) {
					u = c[q >> 2] | 0;
					if ((r | 0) < (u | 0)) u = 0;
					else break;
					while (1) {
						if ((u | 0) >= (n | 0)) break;
						P = ($(c[q >> 2] | 0, u) | 0) + r | 0;
						g[f + (P << 2) >> 2] = +g[z + (P << 2) >> 2];
						u = u + 1 | 0
					}
					r = r + 1 | 0
				}
				O = $(u, n) | 0;
				P = f + (O << 2) | 0;
				Ji(z + (O << 2) | 0, P, P, n, u, s, c[o >> 2] | 0)
			}
			while (0);
			do
			if (C) {
				q = a + 8 | 0;
				if ((x | 0) < (p | 0)) {
					Ji(D, f, f, n, c[q >> 2] | 0, s, c[o >> 2] | 0);
					break
				} else u = 0;
				while (1) {
					p = c[q >> 2] | 0;
					r = $(p, n) | 0;
					if ((u | 0) >= (r | 0)) break;
					g[f + (u << 2) >> 2] = +g[D + (u << 2) >> 2];
					u = u + 1 | 0
				}
				P = f + (r << 2) | 0;
				Ji(D + (r << 2) | 0, P, P, n, p, s, c[o >> 2] | 0)
			}
			while (0);
			n = c[a + 40 >> 2] | 0;
			d: do
			if (n) {
				Q = +Y(+(+(n | 0) * .0006488140788860619 * .6931471805599453));
				o = a + 8 | 0;
				n = 0;
				while (1) {
					if ((n | 0) >= ($(x, c[o >> 2] | 0) | 0)) break d;
					P = f + (n << 2) | 0;
					g[P >> 2] = +g[P >> 2] * Q;
					n = n + 1 | 0
				}
			}
			while (0);
			if ((e | 0) < 2) c[a + 80 >> 2] = 0;
			else c[a + 80 >> 2] = c[l + 28 >> 2] ^ c[m >> 2];
			c[a + 56 >> 2] = h;
			c[a + 64 >> 2] = (F ? 0 : (j | 0) == 0) & 1;
			a = (t | 0) > -1 ? x : t
		}
		while (0);
		ja(v | 0);
		P = a;
		i = k;
		return P | 0
	}
	function xi(b) {
		b = b | 0;
		var c = 0;
		c = i;
		b = a[b >> 0] | 0;
		if (b << 24 >> 24 < 0) {
			i = c;
			return 1002
		} else {
			i = c;
			return ((b & 96) == 96 ? 1001 : 1e3) | 0
		}
		return 0
	}
	function yi(b) {
		b = b | 0;
		var c = 0;
		c = i;
		b = a[b >> 0] | 0;
		if (b << 24 >> 24 < 0) {
			b = (b & 255) >>> 5 & 3;
			i = c;
			return ((b | 0) == 0 ? 1101 : b + 1102 | 0) | 0
		}
		if ((b & 96) == 96) {
			b = (b & 16) != 0 ? 1105 : 1104;
			i = c;
			return b | 0
		} else {
			b = ((b & 255) >>> 5 & 3) + 1101 | 0;
			i = c;
			return b | 0
		}
		return 0
	}
	function zi(a) {
		a = a | 0;
		return ((a & 4) != 0 ? 2 : 1) | 0
	}
	function Ai(a, d, e, f, h, j) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		k = i;
		if ((h | 0) < 1) {
			h = -1;
			i = k;
			return h | 0
		}
		do
		if ((d | 0) != 0 & (e | 0) > 0 & (j | 0) == 0) {
			l = Bi(c[a + 12 >> 2] | 0, d, e) | 0;
			if ((l | 0) > 0) {
				h = (l | 0) > (h | 0) ? h : l;
				break
			} else {
				h = -4;
				i = k;
				return h | 0
			}
		}
		while (0);
		n = a + 8 | 0;
		o = $(h, c[n >> 2] | 0) | 0;
		l = ta() | 0;
		m = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		e = vi(a, d, e, m, h, j, 1) | 0;
		a: do
		if ((e | 0) > 0) {
			j = 0;
			while (1) {
				if ((j | 0) >= ($(e, c[n >> 2] | 0) | 0)) break a;
				b[f + (j << 1) >> 1] = Ci(+g[m + (j << 2) >> 2]) | 0;
				j = j + 1 | 0
			}
		}
		while (0);
		ja(l | 0);
		o = e;
		i = k;
		return o | 0
	}
	function Bi(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0;
		d = i;
		b = Hi(b, c, a) | 0;
		i = d;
		return b | 0
	}
	function Ci(a) {
		a = +a;
		var b = 0,
			c = 0;
		c = i;
		a = a * 32768.0;
		if (a > -32768.0) if (a < 32767.0) b = 3;
		else a = 32767.0;
		else {
			a = -32768.0;
			b = 3
		}
		b = (sa(+a) | 0) & 65535;
		i = c;
		return b | 0
	}
	function Di(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0;
		g = i;
		if ((e | 0) < 1) a = -1;
		else a = vi(a, b, c, d, e, f, 0) | 0;
		i = g;
		return a | 0
	}
	function Ei(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		i = i + 32 | 0;
		j = f;
		g = f + 8 | 0;
		k = c[b + 4 >> 2] | 0;
		h = b + (c[b >> 2] | 0) | 0;
		c[g >> 2] = e;
		a: do
		switch (d | 0) {
		case 4009:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (!h) b = 20;
				else {
					c[h >> 2] = c[b + 48 >> 2];
					g = 0;
					b = 19
				}
				break
			};
		case 4029:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (!h) b = 20;
				else {
					c[h >> 2] = c[b + 12 >> 2];
					g = 0;
					b = 19
				}
				break
			};
		case 4039:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (!h) b = 20;
				else {
					c[h >> 2] = c[b + 68 >> 2];
					g = 0;
					b = 19
				}
				break
			};
		case 4031:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (!h) b = 20;
				else {
					c[h >> 2] = c[b + 80 >> 2];
					g = 0;
					b = 19
				}
				break
			};
		case 4028:
			{
				d = b + k | 0;
				e = b + 44 | 0;
				k = e + 0 | 0;
				g = k + 44 | 0;
				do {
					a[k >> 0] = 0;
					k = k + 1 | 0
				} while ((k | 0) < (g | 0));
				Cb(h, 4028, j);
				zf(d) | 0;
				c[e >> 2] = c[b + 8 >> 2];
				c[b + 60 >> 2] = (c[b + 12 >> 2] | 0) / 400 | 0;
				g = 0;
				b = 19;
				break
			};
		case 4045:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (!h) b = 20;
				else {
					c[h >> 2] = c[b + 40 >> 2];
					g = 0;
					b = 19
				}
				break
			};
		case 4033:
			{
				k = c[g >> 2] | 0;
				d = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if (d) if ((c[b + 56 >> 2] | 0) == 1002) {
					c[j >> 2] = d;
					Cb(h, 4033, j);
					g = 0;
					b = 19;
					break a
				} else {
					c[d >> 2] = c[b + 36 >> 2];
					g = 0;
					b = 19;
					break a
				} else b = 20;
				break
			};
		case 4034:
			{
				k = c[g >> 2] | 0;
				h = c[k >> 2] | 0;
				c[g >> 2] = k + 4;
				if ((h | 0) < -32768 | (h | 0) > 32767) b = 20;
				else {
					c[b + 40 >> 2] = h;
					g = 0;
					b = 19
				}
				break
			};
		default:
			{
				g = -5;
				b = 19
			}
		}
		while (0);
		if ((b | 0) == 19) {
			k = g;
			i = f;
			return k | 0
		} else if ((b | 0) == 20) {
			k = -1;
			i = f;
			return k | 0
		}
		return 0
	}
	function Fi(a) {
		a = a | 0;
		var b = 0;
		b = i;
		ui(a);
		i = b;
		return
	}
	function Gi(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			e = 0;
		c = i;
		if ((b | 0) >= 1) {
			e = (d[a >> 0] | 0) & 3;
			if (e) if ((e | 0) == 3) if ((b | 0) < 2) b = -4;
			else b = (d[a + 1 >> 0] | 0) & 63;
			else b = 2;
			else b = 1
		} else b = -1;
		i = c;
		return b | 0
	}
	function Hi(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0;
		d = i;
		b = Gi(a, b) | 0;
		if ((b | 0) < 0) {
			i = d;
			return b | 0
		} else {
			b = $(b, mi(a, c) | 0) | 0;
			i = d;
			return ((b * 25 | 0) > (c * 3 | 0) ? -4 : b) | 0
		}
		return 0
	}
	function Ii(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function Ji(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0.0;
		j = i;
		h = 48e3 / (h | 0) | 0;
		k = 0;
		while (1) {
			if ((k | 0) < (e | 0)) l = 0;
			else break;
			while (1) {
				if ((l | 0) >= (d | 0)) break;
				n = +g[f + (($(l, h) | 0) << 2) >> 2];
				n = n * n;
				m = ($(l, e) | 0) + k | 0;
				g[c + (m << 2) >> 2] = n * +g[b + (m << 2) >> 2] + (1.0 - n) * +g[a + (m << 2) >> 2];
				l = l + 1 | 0
			}
			k = k + 1 | 0
		}
		i = j;
		return
	}
	function Ki(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0;
		b = i;
		i = i + 16 | 0;
		d = b;
		if ((a | 0) < 1 | (a | 0) > 2) {
			d = 0;
			i = b;
			return d | 0
		}
		if (Lf(d) | 0) {
			d = 0;
			i = b;
			return d | 0
		}
		e = Li(c[d >> 2] | 0) | 0;
		c[d >> 2] = e;
		d = Eb(a) | 0;
		d = (Li(18220) | 0) + e + d | 0;
		i = b;
		return d | 0
	}
	function Li(a) {
		a = a | 0;
		return a + 3 & -4 | 0
	}
	function Mi(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		j = i;
		i = i + 16 | 0;
		h = j;
		k = j + 4 | 0;
		if (!((d | 0) == 8e3 | (d | 0) == 12e3 | (d | 0) == 16e3 | (d | 0) == 24e3 | (d | 0) == 48e3)) {
			n = -1;
			i = j;
			return n | 0
		}
		if ((e + -1 | 0) >>> 0 >= 2) {
			n = -1;
			i = j;
			return n | 0
		}
		if (!((f | 0) == 2051 | (f | 0) == 2049 | (f | 0) == 2048)) {
			n = -1;
			i = j;
			return n | 0
		}
		wj(a | 0, 0, Ki(e) | 0) | 0;
		if (Lf(k) | 0) {
			n = -1;
			i = j;
			return n | 0
		}
		l = Li(c[k >> 2] | 0) | 0;
		c[k >> 2] = l;
		n = Li(18220) | 0;
		c[a + 4 >> 2] = n;
		k = n + l | 0;
		c[a >> 2] = k;
		k = a + k | 0;
		c[a + 100 >> 2] = e;
		c[a + 168 >> 2] = e;
		l = a + 132 | 0;
		c[l >> 2] = d;
		m = a + 18216 | 0;
		c[m >> 2] = 0;
		if (Mf(a + n | 0, 0, a + 8 | 0) | 0) {
			n = -3;
			i = j;
			return n | 0
		}
		c[a + 8 >> 2] = e;
		c[a + 12 >> 2] = e;
		c[a + 16 >> 2] = c[l >> 2];
		c[a + 20 >> 2] = 16e3;
		c[a + 24 >> 2] = 8e3;
		c[a + 28 >> 2] = 16e3;
		c[a + 32 >> 2] = 20;
		c[a + 36 >> 2] = 25e3;
		c[a + 40 >> 2] = 0;
		n = a + 44 | 0;
		c[n >> 2] = 9;
		c[a + 48 >> 2] = 0;
		c[a + 52 >> 2] = 0;
		c[a + 56 >> 2] = 0;
		c[a + 72 >> 2] = 0;
		if (Gb(k, d, e, c[m >> 2] | 0) | 0) {
			n = -3;
			i = j;
			return n | 0
		}
		c[h >> 2] = 0;
		Xb(k, 10016, h) | 0;
		c[h >> 2] = c[n >> 2];
		Xb(k, 4010, h) | 0;
		c[a + 136 >> 2] = 1;
		c[a + 140 >> 2] = 1;
		c[a + 152 >> 2] = -1e3;
		c[a + 148 >> 2] = ($(d, e) | 0) + 3e3;
		c[a + 96 >> 2] = f;
		c[a + 112 >> 2] = -1e3;
		c[a + 116 >> 2] = -1e3;
		c[a + 120 >> 2] = 1105;
		c[a + 108 >> 2] = -1e3;
		c[a + 124 >> 2] = -1e3;
		c[a + 128 >> 2] = -1;
		n = c[l >> 2] | 0;
		c[a + 160 >> 2] = (n | 0) / 100 | 0;
		c[a + 156 >> 2] = 24;
		c[a + 144 >> 2] = 5e3;
		c[a + 104 >> 2] = (n | 0) / 250 | 0;
		b[a + 172 >> 1] = 16384;
		g[a + 180 >> 2] = 1.0;
		c[a + 176 >> 2] = (oh(60) | 0) << 8;
		c[a + 224 >> 2] = 1;
		c[a + 200 >> 2] = 1001;
		c[a + 216 >> 2] = 1105;
		n = 0;
		i = j;
		return n | 0
	}
	function Ni(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		g = i;
		do
		if (((a | 0) == 8e3 | (a | 0) == 12e3 | (a | 0) == 16e3 | (a | 0) == 24e3 | (a | 0) == 48e3 ? (b + -1 | 0) >>> 0 < 2 : 0) ? (d | 0) == 2051 | (d | 0) == 2049 | (d | 0) == 2048 : 0) {
			h = Oi(Ki(b) | 0) | 0;
			if (!h) {
				if (!e) {
					h = 0;
					break
				}
				c[e >> 2] = -7;
				h = 0;
				break
			}
			a = Mi(h, a, b, d) | 0;
			if (e) c[e >> 2] = a;
			if (a) {
				Pi(h);
				h = 0
			}
		} else f = 4;
		while (0);
		if ((f | 0) == 4) if (!e) h = 0;
		else {
			c[e >> 2] = -1;
			h = 0
		}
		i = g;
		return h | 0
	}
	function Oi(a) {
		a = a | 0;
		var b = 0;
		b = i;
		a = qj(a) | 0;
		i = b;
		return a | 0
	}
	function Pi(a) {
		a = a | 0;
		var b = 0;
		b = i;
		rj(a);
		i = b;
		return
	}
	function Qi(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0.0;
		j = i;
		k = 0;
		while (1) {
			if ((k | 0) >= (c | 0)) break;
			g[b + (k << 2) >> 2] = +g[a + (($(k + d | 0, h) | 0) + e << 2) >> 2] * 32768.0;
			k = k + 1 | 0
		}
		a: do
		if ((f | 0) <= -1) {
			if ((f | 0) == -2) {
				f = 1;
				while (1) {
					if ((f | 0) < (h | 0)) k = 0;
					else break a;
					while (1) {
						if ((k | 0) >= (c | 0)) break;
						l = +g[a + (($(k + d | 0, h) | 0) + f << 2) >> 2] * 32768.0;
						e = b + (k << 2) | 0;
						g[e >> 2] = +g[e >> 2] + l;
						k = k + 1 | 0
					}
					f = f + 1 | 0
				}
			}
		} else {
			k = 0;
			while (1) {
				if ((k | 0) >= (c | 0)) break a;
				l = +g[a + (($(k + d | 0, h) | 0) + f << 2) >> 2] * 32768.0;
				e = b + (k << 2) | 0;
				g[e >> 2] = +g[e >> 2] + l;
				k = k + 1 | 0
			}
		}
		while (0);
		l = (h | 0) == -2 ? -.5 : .5;
		h = 0;
		while (1) {
			if ((h | 0) >= (c | 0)) break;
			e = b + (h << 2) | 0;
			g[e >> 2] = +g[e >> 2] * l;
			h = h + 1 | 0
		}
		i = j;
		return
	}
	function Ri(a, c, d, e, f, h, j) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0.0;
		k = i;
		l = 0;
		while (1) {
			if ((l | 0) >= (d | 0)) break;
			g[c + (l << 2) >> 2] = +(b[a + (($(l + e | 0, j) | 0) + f << 1) >> 1] | 0);
			l = l + 1 | 0
		}
		a: do
		if ((h | 0) <= -1) {
			if ((h | 0) == -2) {
				h = 1;
				while (1) {
					if ((h | 0) < (j | 0)) l = 0;
					else break a;
					while (1) {
						if ((l | 0) >= (d | 0)) break;
						m = +(b[a + (($(l + e | 0, j) | 0) + h << 1) >> 1] | 0);
						f = c + (l << 2) | 0;
						g[f >> 2] = +g[f >> 2] + m;
						l = l + 1 | 0
					}
					h = h + 1 | 0
				}
			}
		} else {
			l = 0;
			while (1) {
				if ((l | 0) >= (d | 0)) break a;
				m = +(b[a + (($(l + e | 0, j) | 0) + h << 1) >> 1] | 0);
				f = c + (l << 2) | 0;
				g[f >> 2] = +g[f >> 2] + m;
				l = l + 1 | 0
			}
		}
		while (0);
		m = (j | 0) == -2 ? -152587890625.0e-16 : 152587890625.0e-16;
		j = 0;
		while (1) {
			if ((j | 0) >= (d | 0)) break;
			f = c + (j << 2) | 0;
			g[f >> 2] = +g[f >> 2] * m;
			j = j + 1 | 0
		}
		i = k;
		return
	}
	function Si(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0;
		d = i;
		f = (c | 0) / 400 | 0;
		if ((f | 0) > (a | 0)) {
			b = -1;
			i = d;
			return b | 0
		}
		do
		if ((b | 0) == 5010) {
			f = (c | 0) / 50 | 0;
			e = 6
		} else if ((b | 0) != 5e3) if ((b | 0) > 5e3 & (b | 0) < 5007) {
			e = (c * 3 | 0) / 50 | 0;
			f = f << b + -5001;
			f = (e | 0) < (f | 0) ? e : f;
			e = 6;
			break
		} else {
			b = -1;
			i = d;
			return b | 0
		}
		while (0);
		if ((e | 0) == 6) if ((f | 0) > (a | 0)) {
			b = -1;
			i = d;
			return b | 0
		} else a = f;
		if (!((a * 400 | 0) == (c | 0) | (a * 200 | 0) == (c | 0) | (a * 100 | 0) == (c | 0)) ? (b = a * 50 | 0, !((b | 0) == (c | 0) | (a * 25 | 0) == (c | 0) | (b | 0) == (c * 3 | 0))) : 0) {
			b = -1;
			i = d;
			return b | 0
		}
		b = a;
		i = d;
		return b | 0
	}
	function Ti(a, b, c, d, e, f, g, h, j) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0;
		l = i;
		a: do
		if ((c | 0) == 5010 ? ((e | 0) / 200 | 0 | 0) <= (b | 0) : 0) {
			c = (e | 0) / 400 | 0;
			a = Ui(a, b, d, e, f, j, g, h) | 0;
			while (1) {
				d = c << a;
				if ((d | 0) <= (b | 0)) break a;
				a = a + -1 | 0
			}
		} else k = 6;
		while (0);
		if ((k | 0) == 6) d = Si(b, c, e) | 0;
		i = l;
		return ((d | 0) < 0 ? -1 : d) | 0
	}
	function Ui(a, b, c, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0.0;
		k = i;
		i = i + 224 | 0;
		l = k + 112 | 0;
		m = k;
		o = (d | 0) / 400 | 0;
		n = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		t = +g[f >> 2];
		g[l >> 2] = t;
		g[m >> 2] = 1.0 / (t + 1.0000000036274937e-15);
		d = (h | 0) == 0;
		if (d) {
			p = 0;
			h = 1
		} else {
			p = (o << 1) - h | 0;
			t = +g[f + 4 >> 2];
			g[l + 4 >> 2] = t;
			g[m + 4 >> 2] = 1.0 / (t + 1.0000000036274937e-15);
			t = +g[f + 8 >> 2];
			g[l + 8 >> 2] = t;
			g[m + 8 >> 2] = 1.0 / (t + 1.0000000036274937e-15);
			b = b - p | 0;
			h = 3
		}
		b = (b | 0) / (o | 0) | 0;
		b = (b | 0) < 24 ? b : 24;
		t = 0.0;
		q = 0;
		while (1) {
			if ((q | 0) >= (b | 0)) break;
			s = ($(q, o) | 0) + p | 0;
			Ca[j & 3](a, n, o, s, 0, -2, c);
			t = (q | 0) == 0 ? +g[n >> 2] : t;
			s = 0;
			r = 1.0000000036274937e-15;
			while (1) {
				if ((s | 0) >= (o | 0)) break;
				v = +g[n + (s << 2) >> 2];
				u = v - t;
				t = v;
				s = s + 1 | 0;
				r = r + u * u
			}
			s = q + h | 0;
			g[l + (s << 2) >> 2] = r;
			g[m + (s << 2) >> 2] = 1.0 / r;
			q = q + 1 | 0
		}
		s = q + h | 0;
		g[l + (s << 2) >> 2] = +g[l + (s + -1 << 2) >> 2];
		if (!d) {
			b = b + 2 | 0;
			b = (b | 0) > 24 ? 24 : b
		}
		c = jj(l, m, b, ~~ + ((c * 60 | 0) + 40 | 0), (e | 0) / 400 | 0) | 0;
		e = 1 << c;
		g[f >> 2] = +g[l + (e << 2) >> 2];
		if (d) {
			i = k;
			return c | 0
		}
		g[f + 4 >> 2] = +g[l + (e + 1 << 2) >> 2];
		g[f + 8 >> 2] = +g[l + (e + 2 << 2) >> 2];
		i = k;
		return c | 0
	}
	function Vi(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0.0,
			p = 0.0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0.0,
			u = 0;
		e = i;
		c = (c | 0) / (b | 0) | 0;
		if ((c | 0) < 50) f = 50.0;
		else f = +(c | 0);
		f = 1.0 - 25.0 / f;
		k = 0;
		l = 0.0;
		h = 0.0;
		j = 0.0;
		while (1) {
			if ((k | 0) >= (b | 0)) break;
			u = k << 1;
			t = +g[a + (u << 2) >> 2];
			p = +g[a + ((u | 1) << 2) >> 2];
			s = +g[a + ((u | 2) << 2) >> 2];
			o = +g[a + ((u | 3) << 2) >> 2];
			r = +g[a + ((u | 4) << 2) >> 2];
			n = +g[a + ((u | 5) << 2) >> 2];
			q = +g[a + ((u | 6) << 2) >> 2];
			m = +g[a + ((u | 7) << 2) >> 2];
			k = k + 4 | 0;
			l = l + (t * t + s * s + r * r + q * q);
			h = h + (t * p + s * o + r * n + q * m);
			j = j + (p * p + o * o + n * n + m * m)
		}
		s = +g[d >> 2];
		s = s + f * (l - s);
		g[d >> 2] = s;
		b = d + 4 | 0;
		t = +g[b >> 2];
		t = t + f * (h - t);
		g[b >> 2] = t;
		u = d + 8 | 0;
		h = +g[u >> 2];
		h = h + f * (j - h);
		g[u >> 2] = h;
		j = s < 0.0 ? 0.0 : s;
		g[d >> 2] = j;
		f = t < 0.0 ? 0.0 : t;
		g[b >> 2] = f;
		h = h < 0.0 ? 0.0 : h;
		g[u >> 2] = h;
		if ((j > h ? j : h) > .0007999999797903001) {
			q = +P(+j);
			s = +P(+h);
			t = +P(+q);
			r = +P(+s);
			s = q * s;
			q = f < s ? f : s;
			g[b >> 2] = q;
			s = q / (s + 1.0000000036274937e-15);
			r = +P(+(1.0 - s * s)) * (+O(+(t - r)) / (t + 1.0000000036274937e-15 + r));
			u = d + 12 | 0;
			t = +g[u >> 2];
			s = +(c | 0);
			t = t + (r - t) / s;
			g[u >> 2] = t;
			u = d + 16 | 0;
			s = +g[u >> 2] - .019999999552965164 / s;
			t = s > t ? s : t;
			g[u >> 2] = t;
			t = t * 20.0;
			u = t > 1.0;
			t = u ? 1.0 : t;
			i = e;
			return +t
		} else {
			t = +g[d + 16 >> 2];
			t = t * 20.0;
			u = t > 1.0;
			t = u ? 1.0 : t;
			i = e;
			return +t
		}
		return 0.0
	}
	function Wi(d, e, f, h, j, k, l, m, n, o, p, q, r) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		var s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			_ = 0,
			aa = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0,
			oa = 0,
			pa = 0.0,
			qa = 0,
			ra = 0,
			sa = 0.0,
			ua = 0.0,
			va = 0.0;
		s = i;
		i = i + 528 | 0;
		A = s;
		O = s + 520 | 0;
		x = s + 472 | 0;
		y = s + 464 | 0;
		F = s + 460 | 0;
		C = s + 432 | 0;
		ka = s + 344 | 0;
		ha = s + 312 | 0;
		U = s + 8 | 0;
		P = s + 4 | 0;
		B = s + 526 | 0;
		z = s + 524 | 0;
		c[y >> 2] = 0;
		E = (j | 0) > 1276 ? 1276 : j;
		w = d + 18212 | 0;
		c[w >> 2] = 0;
		K = d + 144 | 0;
		do
		if (!(c[K >> 2] | 0)) {
			D = f * 400 | 0;
			u = c[d + 132 >> 2] | 0;
			if ((D | 0) == (u | 0)) {
				u = d + 132 | 0;
				break
			}
			if (!((f * 200 | 0) == (u | 0) | (f * 100 | 0) == (u | 0)) ? (ra = f * 50 | 0, !((ra | 0) == (u | 0) | (f * 25 | 0) == (u | 0) | (ra | 0) == (u * 3 | 0))) : 0) {
				ra = -1;
				i = s;
				return ra | 0
			} else t = 7
		} else {
			D = f * 400 | 0;
			u = c[d + 132 >> 2] | 0;
			t = 7
		}
		while (0);
		if ((t | 0) == 7) if ((D | 0) < (u | 0)) {
			ra = -1;
			i = s;
			return ra | 0
		} else u = d + 132 | 0;
		if ((E | 0) < 1) {
			ra = -1;
			i = s;
			return ra | 0
		}
		ba = c[d + 4 >> 2] | 0;
		Q = d + ba | 0;
		D = d + (c[d >> 2] | 0) | 0;
		_ = d + 96 | 0;
		if ((c[_ >> 2] | 0) == 2051) G = 0;
		else G = c[d + 104 >> 2] | 0;
		Z = c[d + 156 >> 2] | 0;
		Z = (Z | 0) > (k | 0) ? k : Z;
		c[C >> 2] = 0;
		c[A >> 2] = F;
		Xb(D, 10015, A) | 0;
		ia = d + 44 | 0;
		if ((c[ia >> 2] | 0) > 6 ? (c[u >> 2] | 0) == 48e3 : 0) {
			fa = c[d + 12596 >> 2] | 0;
			ea = c[d + 12600 >> 2] | 0;
			fi(d + 4092 | 0, c[F >> 2] | 0, l, m, f, n, o, p, 48e3, Z, q, C)
		} else {
			fa = -1;
			ea = -1
		}
		I = d + 128 | 0;
		c[I >> 2] = -1;
		ga = d + 18204 | 0;
		c[ga >> 2] = 0;
		do
		if (c[C >> 2] | 0) {
			if ((c[d + 112 >> 2] | 0) == -1e3) c[I >> 2] = ~~ + N(+((1.0 - +g[C + 20 >> 2]) * 100.0 + .5));
			m = c[C + 24 >> 2] | 0;
			if ((m | 0) < 13) {
				c[ga >> 2] = 1101;
				break
			}
			if ((m | 0) < 15) {
				c[ga >> 2] = 1102;
				break
			}
			if ((m | 0) < 17) {
				c[ga >> 2] = 1103;
				break
			}
			if ((m | 0) < 19) {
				c[ga >> 2] = 1104;
				break
			} else {
				c[ga >> 2] = 1105;
				break
			}
		}
		while (0);
		m = d + 100 | 0;
		if ((c[m >> 2] | 0) == 2 ? (c[d + 108 >> 2] | 0) != 1 : 0) pa = +Vi(e, f, c[u >> 2] | 0, d + 232 | 0);
		else pa = 0.0;
		na = Xi(d, f, E) | 0;
		l = d + 148 | 0;
		c[l >> 2] = na;
		T = c[u >> 2] | 0;
		Y = (T | 0) / (f | 0) | 0;
		do
		if ((E | 0) >= 3 ? (na | 0) >= (Y * 24 | 0) : 0) {
			if ((Y | 0) < 50 ? ($(E, Y) | 0) < 300 | (na | 0) < 2400 : 0) break;
			v = d + 136 | 0;
			ma = (c[v >> 2] | 0) == 0;
			if (ma) {
				ra = Y << 3;
				na = (na + (Y << 2) | 0) / (ra | 0) | 0;
				E = (na | 0) < (E | 0) ? na : E;
				na = $(E, ra) | 0;
				c[l >> 2] = na
			}
			R = $(Y, E) | 0;
			S = R << 3;
			L = c[m >> 2] | 0;
			J = Y + -50 | 0;
			k = na - ($((L * 40 | 0) + 20 | 0, J) | 0) | 0;
			M = c[d + 112 >> 2] | 0;
			do
			if ((M | 0) != 3001) if ((M | 0) != 3002) {
				I = c[I >> 2] | 0;
				if ((I | 0) <= -1) {
					la = (c[_ >> 2] | 0) == 2048 ? 115 : 48;
					break
				}
				la = I * 327 >> 8;
				if ((c[_ >> 2] | 0) == 2049) la = (la | 0) < 115 ? la : 115
			} else la = 0;
			else la = 127;
			while (0);
			aa = d + 108 | 0;
			I = c[aa >> 2] | 0;
			M = (L | 0) == 2;
			if ((I | 0) == -1e3) if (M) {
				ra = d + 168 | 0;
				I = (k | 0) > (((c[ra >> 2] | 0) == 2 ? 29e3 : 31e3) | 0) ? 2 : 1;
				c[ra >> 2] = I
			} else t = 55;
			else if (M) c[d + 168 >> 2] = I;
			else t = 55;
			if ((t | 0) == 55) {
				c[d + 168 >> 2] = L;
				I = L
			}
			k = d + 168 | 0;
			J = na - ($((I * 40 | 0) + 20 | 0, J) | 0) | 0;
			L = c[_ >> 2] | 0;
			do
			if ((L | 0) != 2051) {
				qa = c[d + 124 >> 2] | 0;
				if ((qa | 0) == -1e3) {
					va = 1.0 - pa;
					M = ~~ (va * 16.0e3 + pa * 16.0e3);
					M = M + (($($(la, la) | 0, ~~ (va * 64.0e3 + pa * 36.0e3) - M | 0) | 0) >> 14) | 0;
					L = (L | 0) == 2048 ? M + 8e3 | 0 : M;
					M = c[d + 204 >> 2] | 0;
					if ((M | 0) == 1002) L = L + -4e3 | 0;
					else L = (M | 0) > 0 ? L + 4e3 | 0 : L;
					qa = (J | 0) >= (L | 0) ? 1002 : 1e3;
					L = d + 200 | 0;
					c[L >> 2] = qa;
					do
					if (c[d + 48 >> 2] | 0) {
						if ((c[d + 40 >> 2] | 0) <= (128 - la >> 4 | 0)) break;
						c[L >> 2] = 1e3;
						qa = 1e3
					}
					while (0);
					if ((c[d + 52 >> 2] | 0) != 0 & (la | 0) > 100) {
						c[L >> 2] = 1e3;
						M = d + 200 | 0;
						qa = 1e3
					} else t = 68
				} else {
					c[d + 200 >> 2] = qa;
					t = 68
				}
				if ((t | 0) == 68) {
					M = d + 200 | 0;
					if ((qa | 0) == 1002) {
						qa = 1002;
						break
					}
				}
				if (((T | 0) / 100 | 0 | 0) > (f | 0)) {
					c[M >> 2] = 1002;
					qa = 1002
				}
			} else {
				c[d + 200 >> 2] = 1002;
				M = d + 200 | 0;
				qa = 1002
			}
			while (0);
			da = d + 164 | 0;
			if (c[da >> 2] | 0) {
				c[M >> 2] = 1002;
				qa = 1002
			}
			V = (Y | 0) > 50;
			if ((E | 0) < (($(V ? 12e3 : 8e3, f) | 0) / (T << 3 | 0) | 0 | 0)) {
				c[M >> 2] = 1002;
				qa = 1002
			}
			do
			if (((I | 0) == 1 ? (c[d + 208 >> 2] | 0) == 2 : 0) ? (H = d + 64 | 0, !((c[H >> 2] | 0) != 0 | (qa | 0) == 1002)) : 0) {
				oa = c[d + 204 >> 2] | 0;
				if ((oa | 0) == 1002) {
					t = 80;
					break
				}
				c[H >> 2] = 1;
				c[k >> 2] = 2
			} else t = 80;
			while (0);
			if ((t | 0) == 80) {
				c[d + 64 >> 2] = 0;
				oa = c[d + 204 >> 2] | 0
			}
			I = d + 204 | 0;
			do
			if ((oa | 0) > 0) {
				H = (oa | 0) == 1002;
				if ((qa | 0) != 1002) {
					if (H) H = 1002;
					else {
						X = 0;
						W = 0;
						H = 0;
						break
					}
					ra = (qa | 0) != 1002;
					X = ra & 1;
					if (ra) {
						W = 1;
						H = 0;
						break
					}
				} else {
					if (H) {
						qa = 1002;
						X = 0;
						W = 0;
						H = 0;
						break
					}
					H = oa;
					X = (qa | 0) != 1002 & 1
				}
				if (((T | 0) / 100 | 0 | 0) > (f | 0)) {
					qa = 1002;
					W = 0;
					H = 0;
					break
				}
				c[M >> 2] = H;
				qa = H;
				W = 1;
				H = 1
			} else {
				X = 0;
				W = 0;
				H = 0
			}
			while (0);
			L = d + 220 | 0;
			if (!(c[L >> 2] | 0)) {
				ra = 0;
				if (!W) {
					ma = ra;
					T = 0
				} else t = 92
			} else {
				c[L >> 2] = 0;
				X = 1;
				ra = 1;
				W = 1;
				t = 92
			}
			do
			if ((t | 0) == 92) {
				T = (T | 0) / 200 | 0;
				T = ($(E, T) | 0) / (T + f | 0) | 0;
				T = (T | 0) > 257 ? 257 : T;
				if (ma) {
					ma = ra;
					break
				}
				na = (na | 0) / 1600 | 0;
				ma = ra;
				T = (T | 0) < (na | 0) ? T : na
			}
			while (0);
			a: do
			if ((qa | 0) == 1002) {
				ia = 1;
				ka = J;
				t = 103
			} else {
				if ((oa | 0) == 1002) {
					Mf(Q, c[d + 18216 >> 2] | 0, ka) | 0;
					qa = c[M >> 2] | 0;
					ma = 1
				}
				ka = (qa | 0) == 1002;
				if (ka) {
					ia = ka;
					ka = J;
					t = 103;
					break
				}
				do
				if (!(c[d + 224 >> 2] | 0)) if (c[d + 80 >> 2] | 0) {
					t = ka;
					if (t) {
						ia = t;
						ka = J;
						t = 103;
						break a
					} else break
				} else {
					oa = c[d + 216 >> 2] | 0;
					la = ka;
					ha = ma;
					break a
				} else t = ka;
				while (0);
				ka = ($(J, (c[ia >> 2] | 0) + 45 | 0) | 0) / 50 | 0;
				ia = t;
				ka = (c[v >> 2] | 0) == 0 ? ka + -1e3 | 0 : ka;
				t = 103
			}
			while (0);
			do
			if ((t | 0) == 103) {
				if ((c[m >> 2] | 0) == 2 ? (c[aa >> 2] | 0) != 1 : 0) {
					na = 30520;
					oa = 30488
				} else {
					na = 30584;
					oa = 30552
				}
				qa = $(la, la) | 0;
				la = 0;
				while (1) {
					if ((la | 0) >= 8) break;
					ra = c[na + (la << 2) >> 2] | 0;
					c[ha + (la << 2) >> 2] = ra + (($(qa, (c[oa + (la << 2) >> 2] | 0) - ra | 0) | 0) >> 14);
					la = la + 1 | 0
				}
				la = (c[d + 224 >> 2] | 0) == 0;
				na = d + 216 | 0;
				oa = 1105;
				do {
					ra = oa << 1;
					qa = c[ha + (ra + -2204 << 2) >> 2] | 0;
					ra = c[ha + (ra + -2203 << 2) >> 2] | 0;
					do
					if (la) if ((c[na >> 2] | 0) < (oa | 0)) {
						qa = qa + ra | 0;
						break
					} else {
						qa = qa - ra | 0;
						break
					}
					while (0);
					if ((ka | 0) >= (qa | 0)) break;
					oa = oa + -1 | 0
				} while ((oa | 0) > 1101);
				c[na >> 2] = oa;
				if (la ^ 1 | ia) {
					la = ia;
					ha = ma;
					break
				}
				if (!((c[d + 84 >> 2] | 0) == 0 & (oa | 0) > 1103)) {
					la = ia;
					ha = ma;
					break
				}
				c[na >> 2] = 1103;
				oa = 1103;
				la = ia;
				ha = ma
			}
			while (0);
			ia = d + 216 | 0;
			ka = c[d + 120 >> 2] | 0;
			if ((oa | 0) > (ka | 0)) {
				c[ia >> 2] = ka;
				oa = ka
			}
			ka = d + 116 | 0;
			ma = c[ka >> 2] | 0;
			if ((ma | 0) == -1e3) ma = -1e3;
			else {
				c[ia >> 2] = ma;
				oa = ma
			}
			if ((la ^ 1) & (S | 0) < 15e3) {
				oa = (oa | 0) < 1103 ? oa : 1103;
				c[ia >> 2] = oa
			}
			na = c[u >> 2] | 0;
			do
			if ((na | 0) < 24001) {
				if ((oa | 0) > 1104) {
					c[ia >> 2] = 1104;
					oa = 1104
				}
				if ((na | 0) >= 16001) break;
				if ((oa | 0) > 1103) {
					c[ia >> 2] = 1103;
					oa = 1103
				}
				if ((na | 0) >= 12001) break;
				if ((oa | 0) > 1102) {
					c[ia >> 2] = 1102;
					oa = 1102
				}
				if (!((na | 0) < 8001 & (oa | 0) > 1101)) break;
				c[ia >> 2] = 1101;
				oa = 1101
			}
			while (0);
			na = c[ga >> 2] | 0;
			if ((na | 0) != 0 & (ma | 0) == -1e3) {
				ma = c[k >> 2] | 0;
				do
				if ((J | 0) > (ma * 18e3 | 0) | la ^ 1) {
					if (!((J | 0) > (ma * 24e3 | 0) | la ^ 1)) {
						la = 1102;
						break
					}
					if ((J | 0) <= (ma * 3e4 | 0)) {
						la = 1103;
						break
					}
					la = (J | 0) > (ma * 44e3 | 0) ? 1105 : 1104
				} else la = 1101;
				while (0);
				ra = (na | 0) > (la | 0) ? na : la;
				c[ga >> 2] = ra;
				c[ia >> 2] = (oa | 0) < (ra | 0) ? oa : ra
			}
			c[A >> 2] = Z;
			Xb(D, 4036, A) | 0;
			la = c[M >> 2] | 0;
			ma = (la | 0) == 1002;
			do
			if (ma) {
				if ((c[ia >> 2] | 0) != 1102) break;
				c[ia >> 2] = 1103
			}
			while (0);
			if (c[da >> 2] | 0) c[ia >> 2] = 1101;
			ga = c[u >> 2] | 0;
			do
			if (((ga | 0) / 50 | 0 | 0) < (f | 0)) {
				if (!ma ? (ca = c[ia >> 2] | 0, (ca | 0) <= 1103) : 0) break;
				if ((fa | 0) != -1) {
					c[d + 12596 >> 2] = fa;
					c[d + 12600 >> 2] = ea
				}
				A = ((ga | 0) / 25 | 0 | 0) < (f | 0) ? 3 : 2;
				D = (j + -3 | 0) / (A | 0) | 0;
				D = (D | 0) > 1276 ? 1276 : D;
				f = $(A, D) | 0;
				w = ta() | 0;
				E = i;
				i = i + ((1 * f | 0) + 15 & -16) | 0;
				lj(U);
				f = d + 124 | 0;
				z = c[f >> 2] | 0;
				y = c[ka >> 2] | 0;
				x = c[aa >> 2] | 0;
				c[f >> 2] = c[M >> 2];
				c[ka >> 2] = c[ia >> 2];
				k = c[k >> 2] | 0;
				c[aa >> 2] = k;
				C = d + 64 | 0;
				B = c[C >> 2] | 0;
				if (!B) c[d + 208 >> 2] = k;
				else c[aa >> 2] = 1;
				F = (H | 0) != 0;
				k = A + -1 | 0;
				H = 0;
				while (1) {
					if ((H | 0) >= (A | 0)) {
						t = 163;
						break
					}
					c[C >> 2] = 0;
					if (F & (H | 0) == (k | 0)) c[f >> 2] = 1002;
					G = c[u >> 2] | 0;
					I = E + ($(H, D) | 0) | 0;
					G = Wi(d, e + (($(H, ($(c[m >> 2] | 0, G) | 0) / 50 | 0) | 0) << 2) | 0, (G | 0) / 50 | 0, I, D, Z, 0, 0, n, o, p, q, r) | 0;
					if ((G | 0) < 0) {
						h = -3;
						break
					}
					if ((mj(U, I, G) | 0) < 0) {
						h = -3;
						break
					}
					H = H + 1 | 0
				}
				do
				if ((t | 0) == 163) {
					d = (c[v >> 2] | 0) == 0;
					if (d) {
						ra = ((c[l >> 2] | 0) * 3 | 0) / (1200 / (A >>> 0) | 0 | 0) | 0;
						j = (ra | 0) < (j | 0) ? ra : j
					}
					h = oj(U, A, h, j, d & 1) | 0;
					if ((h | 0) < 0) {
						h = -3;
						break
					}
					c[f >> 2] = z;
					c[ka >> 2] = y;
					c[aa >> 2] = x;
					c[C >> 2] = B
				}
				while (0);
				ja(w | 0);
				ra = h;
				i = s;
				return ra | 0
			} else ca = c[ia >> 2] | 0;
			while (0);
			do
			if ((la | 0) == 1e3) {
				if ((ca | 0) <= 1103) break;
				c[M >> 2] = 1001;
				if ((ca | 0) < 1104) t = 172
			} else if ((la | 0) == 1001 & (ca | 0) < 1104) t = 172;
			while (0);
			if ((t | 0) == 172) c[M >> 2] = 1e3;
			n = E - T | 0;
			Z = ($(c[l >> 2] | 0, f) | 0) / (ga << 3 | 0) | 0;
			Z = ((n | 0) < (Z | 0) ? n : Z) + -1 | 0;
			n = E + -1 | 0;
			wc(x, h + 1 | 0, n);
			p = G + f | 0;
			q = $(p, c[m >> 2] | 0) | 0;
			U = ta() | 0;
			j = i;
			i = i + ((4 * q | 0) + 15 & -16) | 0;
			q = d + 160 | 0;
			ra = c[m >> 2] | 0;
			yj(j | 0, d + (($((c[q >> 2] | 0) - G | 0, ra) | 0) << 2) + 252 | 0, ($(G, ra) | 0) << 2 | 0) | 0;
			if ((c[M >> 2] | 0) == 1002) o = (oh(60) | 0) << 8;
			else o = c[d + (ba + 8) >> 2] | 0;
			ra = d + 176 | 0;
			qa = c[ra >> 2] | 0;
			o = o - qa | 0;
			o = qa + (((o >> 16) * 983 | 0) + (((o & 65535) * 983 | 0) >>> 16)) | 0;
			c[ra >> 2] = o;
			if ((c[_ >> 2] | 0) == 2048) {
				oa = sh(o >> 8) | 0;
				ra = c[m >> 2] | 0;
				qa = j + (($(G, ra) | 0) << 2) | 0;
				Zi(e, oa, qa, d + 184 | 0, f, ra, c[u >> 2] | 0)
			} else {
				ra = c[m >> 2] | 0;
				qa = j + (($(G, ra) | 0) << 2) | 0;
				_i(e, qa, d + 184 | 0, f, ra, c[u >> 2] | 0)
			}
			do
			if (r) {
				e = c[m >> 2] | 0;
				r = j + (($(G, e) | 0) << 2) | 0;
				e = $(e, f) | 0;
				va = +$i(r, r, e);
				if (!(!(va < 1.0e9) | (va != va | 0.0 != 0.0))) break;
				wj(r | 0, 0, e << 2 | 0) | 0
			}
			while (0);
			b: do
			if ((c[M >> 2] | 0) == 1002) {
				pa = 1.0;
				O = 0;
				t = 244
			} else {
				aa = $(c[m >> 2] | 0, f) | 0;
				e = ta() | 0;
				r = i;
				i = i + ((2 * aa | 0) + 15 & -16) | 0;
				aa = $(Z << 3, Y) | 0;
				Y = c[M >> 2] | 0;
				o = (Y | 0) == 1001;
				do
				if (!o) {
					c[d + 36 >> 2] = aa;
					_ = c[d + 228 >> 2] | 0;
					if (!_) pa = 1.0;
					else {
						pa = 1.0;
						t = 191
					}
				} else {
					ba = c[k >> 2] | 0;
					fa = $(ba, (c[u >> 2] | 0) == (f * 100 | 0) ? 6e3 : 5e3) | 0;
					_ = d + 36 | 0;
					c[_ >> 2] = fa;
					ea = (ca | 0) == 1104;
					ga = aa - fa | 0;
					if (ea) ga = (ga << 1 | 0) / 3 | 0;
					else ga = (ga * 3 | 0) / 5 | 0;
					ra = fa + ga | 0;
					qa = (aa << 2 | 0) / 5 | 0;
					oa = (ra | 0) > (qa | 0);
					fa = oa ? qa : ra;
					c[_ >> 2] = oa ? qa : ra;
					_ = c[d + 228 >> 2] | 0;
					if (_) {
						aa = fa;
						pa = 1.0;
						t = 191;
						break
					}
					pa = +(aa - fa | 0);
					pa = pa / (pa + +($(ba, ea ? 3e3 : 3600) | 0));
					if (!(pa < .8571428656578064)) {
						aa = fa;
						pa = 1.0;
						break
					}
					aa = fa;
					pa = pa + .1428571492433548
				}
				while (0);
				do
				if ((t | 0) == 191) {
					if (!(c[v >> 2] | 0)) break;
					if (c[da >> 2] | 0) break;
					ba = c[ia >> 2] | 0;
					if ((ba | 0) == 1101) {
						ga = 13;
						sa = 8.0e3
					} else {
						ra = (ba | 0) == 1102;
						ga = ra ? 15 : 17;
						sa = ra ? 12.0e3 : 16.0e3
					}
					ea = c[m >> 2] | 0;
					ua = 0.0;
					fa = 0;
					while (1) {
						if ((fa | 0) >= (ea | 0)) break;
						da = fa * 21 | 0;
						ia = 0;
						while (1) {
							if ((ia | 0) >= (ga | 0)) break;
							va = +g[_ + (da + ia << 2) >> 2];
							do
							if (va < .5) {
								if (!(va > -2.0)) {
									va = -2.0;
									break
								}
								if (va > 0.0) t = 202
							} else {
								va = .5;
								t = 202
							}
							while (0);
							if ((t | 0) == 202) {
								t = 0;
								va = va * .5
							}
							ua = ua + va;
							ia = ia + 1 | 0
						}
						fa = fa + 1 | 0
					}
					ra = ~~ (sa * (ua / +(ga | 0) * +(ea | 0) + .20000000298023224));
					_ = ($(aa, -2) | 0) / 3 | 0;
					_ = (ra | 0) > (_ | 0) ? ra : _;
					if ((ba + -1104 | 0) >>> 0 < 2) ba = (_ * 3 | 0) / 5 | 0;
					else ba = _;
					aa = aa + ba | 0;
					c[d + 36 >> 2] = aa;
					ra = $(_, f) | 0;
					Z = Z + ((ra | 0) / (c[u >> 2] << 3 | 0) | 0) | 0
				}
				while (0);
				ba = c[u >> 2] | 0;
				c[d + 32 >> 2] = (f * 1e3 | 0) / (ba | 0) | 0;
				_ = c[m >> 2] | 0;
				c[d + 8 >> 2] = _;
				c[d + 12 >> 2] = c[k >> 2];
				if ((ca | 0) == 1101) {
					c[d + 28 >> 2] = 8e3;
					da = 8e3
				} else if ((ca | 0) == 1102) {
					c[d + 28 >> 2] = 12e3;
					da = 12e3
				} else {
					c[d + 28 >> 2] = 16e3;
					da = 16e3
				}
				ea = d + 24 | 0;
				do
				if (o) {
					c[ea >> 2] = 16e3;
					t = 221
				} else {
					c[ea >> 2] = 8e3;
					if ((Y | 0) != 1e3) {
						t = 221;
						break
					}
					Y = d + 20 | 0;
					c[Y >> 2] = 16e3;
					if (V) S = (R << 4 | 0) / 3 | 0;
					if ((S | 0) < 13e3) {
						c[Y >> 2] = 12e3;
						da = da >>> 0 > 12e3 ? 12e3 : da;
						c[d + 28 >> 2] = da
					}
					if ((S | 0) >= 9600) break;
					c[Y >> 2] = 8e3;
					c[d + 28 >> 2] = (da | 0) > 8e3 ? 8e3 : da
				}
				while (0);
				if ((t | 0) == 221) c[d + 20 >> 2] = 16e3;
				S = (c[v >> 2] | 0) == 0;
				c[d + 56 >> 2] = S & 1;
				V = n - T | 0;
				V = (V | 0) > 1275 ? 1275 : V;
				c[O >> 2] = V;
				R = d + 60 | 0;
				if (o) V = (V * 72 | 0) / 10 | 0;
				else V = V << 3;
				c[R >> 2] = V;
				if (S) {
					c[R >> 2] = (($(aa, f) | 0) / (ba << 3 | 0) | 0) << 3;
					ra = aa + -2e3 | 0;
					c[d + 36 >> 2] = (ra | 0) < 1 ? 1 : ra
				}
				if (!ha) P = 0;
				else {
					c[P >> 2] = 0;
					qa = (ba | 0) / 400 | 0;
					S = $(_, (c[q >> 2] | 0) - (c[d + 104 >> 2] | 0) - qa | 0) | 0;
					oa = d + (S << 2) + 252 | 0;
					ra = c[F >> 2] | 0;
					aj(oa, oa, 0.0, 1.0, c[ra + 4 >> 2] | 0, qa, _, c[ra + 60 >> 2] | 0, ba);
					wj(d + 252 | 0, 0, S << 2 | 0) | 0;
					S = 0;
					while (1) {
						R = c[q >> 2] | 0;
						if ((S | 0) >= ($(R, c[m >> 2] | 0) | 0)) break;
						b[r + (S << 1) >> 1] = bj(+g[d + (S << 2) + 252 >> 2]) | 0;
						S = S + 1 | 0
					}
					Of(Q, d + 8 | 0, r, R, 0, P, 1) | 0;
					P = 0
				}
				while (1) {
					R = c[m >> 2] | 0;
					if ((P | 0) >= ($(R, f) | 0)) break;
					b[r + (P << 1) >> 1] = bj(+g[j + (($(G, R) | 0) + P << 2) >> 2]) | 0;
					P = P + 1 | 0
				}
				P = Of(Q, d + 8 | 0, r, f, x, O, 0) | 0;
				do
				if (!P) {
					if (!(c[O >> 2] | 0)) {
						c[w >> 2] = 0;
						a[h >> 0] = Yi(c[M >> 2] | 0, (c[u >> 2] | 0) / (f | 0) | 0, ca, c[k >> 2] | 0) | 0;
						E = 1;
						break
					}
					do
					if ((c[M >> 2] | 0) == 1e3) {
						t = c[d + 76 >> 2] | 0;
						if ((t | 0) == 8e3) {
							ca = 1101;
							break
						}
						if ((t | 0) == 12e3) {
							ca = 1102;
							break
						}
						ca = (t | 0) == 16e3 ? 1103 : ca
					}
					while (0);
					ra = c[d + 92 >> 2] | 0;
					c[d + 68 >> 2] = ra;
					if (ra) {
						c[L >> 2] = 1;
						X = 0;
						W = 1
					}
					ja(e | 0);
					O = P;
					t = 244;
					break b
				} else E = -3;
				while (0);
				ja(e | 0)
			}
			while (0);
			c: do
			if ((t | 0) == 244) {
				if ((ca | 0) == 1101) P = 13;
				else if ((ca | 0) == 1103 | (ca | 0) == 1102) P = 17;
				else if ((ca | 0) == 1104) P = 19;
				else P = 21;
				c[A >> 2] = P;
				Xb(D, 10012, A) | 0;
				c[A >> 2] = c[k >> 2];
				Xb(D, 10008, A) | 0;
				c[A >> 2] = -1;
				Xb(D, 4002, A) | 0;
				do
				if ((c[M >> 2] | 0) == 1e3) {
					R = c[m >> 2] | 0;
					Z = ($(R, c[u >> 2] | 0) | 0) / 400 | 0;
					K = i;
					i = i + ((4 * Z | 0) + 15 & -16) | 0;
					Z = 0
				} else {
					c[A >> 2] = 0;
					Xb(D, 4006, A) | 0;
					c[A >> 2] = (c[d + 72 >> 2] | 0) == 0 ? 2 : 0;
					Xb(D, 10002, A) | 0;
					P = c[M >> 2] | 0;
					if ((P | 0) != 1001) {
						if (c[v >> 2] | 0) {
							do
							if ((c[K >> 2] | 0) == 5010) {
								K = c[u >> 2] | 0;
								if (((K | 0) / 50 | 0 | 0) == (f | 0)) {
									K = 0;
									break
								}
								K = $(((c[k >> 2] | 0) * 60 | 0) + 40 | 0, ((K | 0) / (f | 0) | 0) + -50 | 0) | 0;
								if (!(c[C >> 2] | 0)) break;
								K = ~~ (+(K | 0) * (+g[C + 4 >> 2] * .5 + 1.0))
							} else K = 0;
							while (0);
							c[A >> 2] = 1;
							Xb(D, 4006, A) | 0;
							c[A >> 2] = c[d + 140 >> 2];
							Xb(D, 4020, A) | 0;
							c[A >> 2] = (c[l >> 2] | 0) + K;
							Xb(D, 4002, A) | 0;
							P = c[M >> 2] | 0;
							Z = n - T | 0
						}
						R = c[m >> 2] | 0;
						Q = c[u >> 2] | 0;
						S = ($(R, Q) | 0) / 400 | 0;
						K = i;
						i = i + ((4 * S | 0) + 15 & -16) | 0;
						if ((P | 0) == 1e3) break
					} else {
						K = (cj(c[x + 20 >> 2] | 0, c[x + 28 >> 2] | 0) | 0) + 7 >> 3;
						K = (W | 0) == 0 ? K : K + 3 | 0;
						if (!(c[v >> 2] | 0)) Z = (K | 0) > (Z | 0) ? K : Z;
						else {
							ra = $(c[d + 36 >> 2] | 0, f) | 0;
							Z = K + Z - ((ra | 0) / (c[u >> 2] << 3 | 0) | 0) | 0
						}
						R = c[m >> 2] | 0;
						Q = c[u >> 2] | 0;
						S = ($(R, Q) | 0) / 400 | 0;
						K = i;
						i = i + ((4 * S | 0) + 15 & -16) | 0;
						P = 1001
					}
					ra = c[I >> 2] | 0;
					if (!((P | 0) != (ra | 0) & (ra | 0) > 0)) break;
					yj(K | 0, d + (($((c[q >> 2] | 0) - G - ((Q | 0) / 400 | 0) | 0, R) | 0) << 2) + 252 | 0, S << 2 | 0) | 0
				}
				while (0);
				Q = c[q >> 2] | 0;
				P = d + 252 | 0;
				if (($(R, Q - p | 0) | 0) > 0) {
					ra = $(R, Q - f - G | 0) | 0;
					zj(P | 0, d + (($(R, f) | 0) << 2) + 252 | 0, ra << 2 | 0) | 0;
					yj(d + (ra << 2) + 252 | 0, j | 0, ($(p, R) | 0) << 2 | 0) | 0
				} else yj(P | 0, j + (($(p - Q | 0, R) | 0) << 2) | 0, ($(Q, R) | 0) << 2 | 0) | 0;
				G = d + 180 | 0;
				sa = +g[G >> 2];
				if (sa < 1.0 | pa < 1.0) {
					ra = c[F >> 2] | 0;
					aj(j, j, sa, pa, c[ra + 4 >> 2] | 0, f, c[m >> 2] | 0, c[ra + 60 >> 2] | 0, c[u >> 2] | 0)
				}
				g[G >> 2] = pa;
				G = c[M >> 2] | 0;
				if (!((G | 0) == 1001 ? (c[k >> 2] | 0) != 1 : 0)) {
					if ((J + -3e4 | 0) < 0) J = 0;
					else {
						J = (J << 1) + -6e4 | 0;
						J = (J | 0) > 16384 ? 16384 : J
					}
					c[d + 88 >> 2] = J
				}
				do
				if (!(c[d + 228 >> 2] | 0)) {
					if ((c[m >> 2] | 0) != 2) break;
					P = d + 172 | 0;
					Q = b[P >> 1] | 0;
					J = c[d + 88 >> 2] | 0;
					if (!(Q << 16 >> 16 < 16384 | (J | 0) < 16384)) break;
					G = c[F >> 2] | 0;
					dj(j, j, +(Q << 16 >> 16) * 6103515625.0e-14, +(J | 0) * 6103515625.0e-14, c[G + 4 >> 2] | 0, f, 2, c[G + 60 >> 2] | 0, c[u >> 2] | 0);
					b[P >> 1] = c[d + 88 >> 2];
					G = c[M >> 2] | 0
				}
				while (0);
				do
				if ((G | 0) == 1002) t = 291;
				else {
					J = x + 20 | 0;
					F = x + 28 | 0;
					P = cj(c[J >> 2] | 0, c[F >> 2] | 0) | 0;
					G = (G | 0) == 1001;
					if ((P + 17 + (G ? 20 : 0) | 0) > ((E << 3) + -8 | 0)) {
						t = 291;
						break
					}
					if (G) {
						if ((W | 0) == 0 ? (P + 37 | 0) > (Z << 3 | 0) : 0) {
							t = 291;
							break
						}
						Bc(x, W, 12)
					}
					if (!W) {
						t = 291;
						break
					}
					Bc(x, X, 1);
					G = (c[M >> 2] | 0) == 1001;
					if (G) F = Z;
					else F = (cj(c[J >> 2] | 0, c[F >> 2] | 0) | 0) + 7 >> 3;
					ra = n - F | 0;
					l = (c[l >> 2] | 0) / 1600 | 0;
					l = (ra | 0) < (l | 0) ? ra : l;
					if ((l | 0) < 2) l = 2;
					else l = (l | 0) > 257 ? 257 : l;
					if (!G) break;
					Dc(x, l + -2 | 0, 256)
				}
				while (0);
				if ((t | 0) == 291) {
					c[L >> 2] = 0;
					W = 0;
					l = 0
				}
				F = c[M >> 2] | 0;
				do
				if ((F | 0) == 1002) {
					G = 0;
					t = 295
				} else {
					if ((F | 0) != 1e3) {
						G = 17;
						t = 295;
						break
					}
					O = (cj(c[x + 20 >> 2] | 0, c[x + 28 >> 2] | 0) | 0) + 7 >> 3;
					Ic(x);
					F = O;
					G = 17
				}
				while (0);
				if ((t | 0) == 295) {
					F = n - l | 0;
					F = (F | 0) < (Z | 0) ? F : Z;
					Hc(x, F)
				}
				t = (W | 0) == 0;
				do
				if (t) {
					if ((c[M >> 2] | 0) == 1e3) break;
					c[A >> 2] = C;
					Xb(D, 10022, A) | 0
				} else {
					c[A >> 2] = C;
					Xb(D, 10022, A) | 0;
					if (!X) break;
					c[A >> 2] = 0;
					Xb(D, 10010, A) | 0;
					c[A >> 2] = 0;
					Xb(D, 4006, A) | 0;
					if ((Kb(D, j, (c[u >> 2] | 0) / 200 | 0, h + (F + 1) | 0, l, 0) | 0) < 0) {
						E = -3;
						break c
					}
					c[A >> 2] = y;
					Xb(D, 4031, A) | 0;
					Xb(D, 4028, A) | 0
				}
				while (0);
				c[A >> 2] = G;
				Xb(D, 10010, A) | 0;
				C = c[M >> 2] | 0;
				do
				if ((C | 0) != 1e3) {
					ra = c[I >> 2] | 0;
					if ((C | 0) != (ra | 0) & (ra | 0) > 0) {
						Xb(D, 4028, A) | 0;
						Kb(D, K, (c[u >> 2] | 0) / 400 | 0, B, 2, 0) | 0;
						c[A >> 2] = 0;
						Xb(D, 10002, A) | 0
					}
					if ((cj(c[x + 20 >> 2] | 0, c[x + 28 >> 2] | 0) | 0) > (F << 3 | 0)) break;
					O = Kb(D, j, f, 0, F, x) | 0;
					if ((O | 0) < 0) {
						E = -3;
						break c
					}
				}
				while (0);
				if ((t ^ 1) & (X | 0) == 0) {
					oa = c[u >> 2] | 0;
					ra = (oa | 0) / 200 | 0;
					oa = (oa | 0) / 400 | 0;
					Xb(D, 4028, A) | 0;
					c[A >> 2] = 0;
					Xb(D, 10010, A) | 0;
					c[A >> 2] = 0;
					Xb(D, 10002, A) | 0;
					qa = f - ra | 0;
					Kb(D, j + (($(c[m >> 2] | 0, qa - oa | 0) | 0) << 2) | 0, oa, z, 2, 0) | 0;
					if ((Kb(D, j + (($(c[m >> 2] | 0, qa) | 0) << 2) | 0, ra, h + (F + 1) | 0, l, 0) | 0) < 0) {
						E = -3;
						break
					}
					c[A >> 2] = y;
					Xb(D, 4031, A) | 0
				}
				a[h >> 0] = Yi(c[M >> 2] | 0, (c[u >> 2] | 0) / (f | 0) | 0, ca, c[k >> 2] | 0) | 0;
				u = c[x + 28 >> 2] | 0;
				c[w >> 2] = u ^ c[y >> 2];
				if (!H) m = c[M >> 2] | 0;
				else m = 1002;
				c[I >> 2] = m;
				c[d + 208 >> 2] = c[k >> 2];
				c[d + 212 >> 2] = f;
				c[d + 224 >> 2] = 0;
				d: do
				if ((cj(c[x + 20 >> 2] | 0, u) | 0) > ((E << 3) + -8 | 0)) {
					if ((E | 0) < 2) {
						E = -2;
						break c
					}
					a[h + 1 >> 0] = 0;
					c[w >> 2] = 0;
					O = 1
				} else {
					if ((c[M >> 2] | 0) == 1e3 ^ 1 | t ^ 1) break;
					while (1) {
						if ((O | 0) <= 2) break d;
						if (a[h + O >> 0] | 0) break d;
						O = O + -1 | 0
					}
				}
				while (0);
				d = O + (l + 1) | 0;
				if (!(c[v >> 2] | 0)) {
					if (pj(h, d, E) | 0) {
						E = -3;
						break
					}
				} else E = d
			}
			while (0);
			ja(U | 0);
			ra = E;
			i = s;
			return ra | 0
		}
		while (0);
		m = c[d + 200 >> 2] | 0;
		u = c[d + 216 >> 2] | 0;
		u = (u | 0) == 0 ? 1101 : u;
		do
		if ((Y | 0) <= 100) {
			if ((Y | 0) >= 50 ? (v = (m | 0) == 0 ? 1e3 : m, (v | 0) != 1e3) : 0) if ((v | 0) == 1002) {
				t = 38;
				break
			} else {
				t = 39;
				break
			}
			if ((u | 0) > 1103) {
				u = 1103;
				v = 1e3
			} else {
				v = 1e3;
				t = 40
			}
		} else {
			v = 1002;
			t = 38
		}
		while (0);
		if ((t | 0) == 38) if ((u | 0) == 1102) u = 1101;
		else t = 39;
		if ((t | 0) == 39) if ((u | 0) < 1105) t = 40;
		if ((t | 0) == 40) u = 1104;
		a[h >> 0] = Yi(v, Y, u, c[d + 168 >> 2] | 0) | 0;
		ra = 1;
		i = s;
		return ra | 0
	}
	function Xi(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		if (!b) b = (c[a + 132 >> 2] | 0) / 400 | 0;
		f = c[a + 152 >> 2] | 0;
		if ((f | 0) == -1) {
			f = ($(d << 3, c[a + 132 >> 2] | 0) | 0) / (b | 0) | 0;
			i = e;
			return f | 0
		} else if ((f | 0) == -1e3) {
			f = c[a + 132 >> 2] | 0;
			f = ((f * 60 | 0) / (b | 0) | 0) + ($(f, c[a + 100 >> 2] | 0) | 0) | 0;
			i = e;
			return f | 0
		} else {
			i = e;
			return f | 0
		}
		return 0
	}
	function Yi(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = i;
		f = 0;
		while (1) {
			if ((b | 0) >= 400) break;
			b = b << 1;
			f = f + 1 | 0
		}
		if ((a | 0) == 1e3) c = (c << 5) + 96 & 224 | (f << 3) + -16;
		else if ((a | 0) == 1002) {
			c = c + -1102 | 0;
			c = ((c | 0) < 0 ? 0 : c) << 5 & 96 | f << 3 | 128
		} else c = c << 4 | (f << 3) + 240 | 96;
		i = e;
		return (c | ((d | 0) == 2 & 1) << 2) & 255 | 0
	}
	function Zi(a, b, d, e, f, g, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		j = i;
		i = i + 32 | 0;
		k = j + 8 | 0;
		l = j;
		m = ((b << 16 >> 16) * 2471 | 0) / ((h | 0) / 1e3 | 0 | 0) | 0;
		h = $(m, -471) | 0;
		b = h + 268435456 | 0;
		c[k >> 2] = b;
		c[k + 4 >> 2] = -268435456 - h << 1;
		c[k + 8 >> 2] = b;
		h = b >> 6;
		o = m << 16 >> 16;
		p = $(m >> 16, o) | 0;
		o = $(m & 65535, o) | 0;
		m = $(m, (m >> 15) + 1 >> 1) | 0;
		q = p + (o >>> 16) + m << 16 >> 16;
		n = h & 65535;
		c[l >> 2] = ($(b >> 22, q) | 0) + (($(n, q) | 0) >> 16) + ($(h, (p + (o >> 16) + m + -8388608 >> 15) + 1 >> 1) | 0);
		m = h << 16 >> 16;
		c[l + 4 >> 2] = ($(b >> 22, m) | 0) + (($(n, m) | 0) >> 16) + ($(h, (b >> 21) + 1 >> 1) | 0);
		ij(a, k, l, e, d, f, g);
		if ((g | 0) != 2) {
			i = j;
			return
		}
		ij(a + 4 | 0, k, l, e + 8 | 0, d + 4 | 0, f, 2);
		i = j;
		return
	}
	function _i(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0.0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0.0;
		h = i;
		j = 12.0 / +(f | 0);
		f = 0;
		while (1) {
			if ((f | 0) >= (e | 0)) break;
			l = f << 1;
			k = c + (l << 2) | 0;
			l = c + ((l | 1) << 2) | 0;
			m = 0;
			while (1) {
				if ((m | 0) >= (d | 0)) break;
				n = ($(m, e) | 0) + f | 0;
				p = +g[k >> 2];
				o = +g[a + (n << 2) >> 2] - p;
				g[k >> 2] = p + j * o + 1.0000000031710769e-30;
				p = +g[l >> 2];
				o = o - p;
				g[l >> 2] = p + j * o + 1.0000000031710769e-30;
				g[b + (n << 2) >> 2] = o;
				m = m + 1 | 0
			}
			f = f + 1 | 0
		}
		i = h;
		return
	}
	function $i(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0.0,
			f = 0,
			h = 0.0;
		d = i;
		f = 0;
		e = 0.0;
		while (1) {
			if ((f | 0) >= (c | 0)) break;
			h = e + +g[a + (f << 2) >> 2] * +g[b + (f << 2) >> 2];
			f = f + 1 | 0;
			e = h
		}
		i = d;
		return +e
	}
	function aj(a, b, c, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = +d;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0.0,
			o = 0;
		l = i;
		k = 48e3 / (k | 0) | 0;
		e = (e | 0) / (k | 0) | 0;
		a: do
		if ((h | 0) == 1) {
			m = 0;
			while (1) {
				if ((m | 0) >= (e | 0)) {
					j = 0;
					break a
				}
				n = +g[j + (($(m, k) | 0) << 2) >> 2];
				n = n * n;
				g[b + (m << 2) >> 2] = (n * d + (1.0 - n) * c) * +g[a + (m << 2) >> 2];
				m = m + 1 | 0
			}
		} else {
			m = 0;
			while (1) {
				if ((m | 0) >= (e | 0)) {
					j = 0;
					break a
				}
				n = +g[j + (($(m, k) | 0) << 2) >> 2];
				n = n * n;
				n = n * d + (1.0 - n) * c;
				o = m << 1;
				g[b + (o << 2) >> 2] = n * +g[a + (o << 2) >> 2];
				o = o | 1;
				g[b + (o << 2) >> 2] = n * +g[a + (o << 2) >> 2];
				m = m + 1 | 0
			}
		}
		while (0);
		do {
			k = e;
			while (1) {
				if ((k | 0) >= (f | 0)) break;
				o = ($(k, h) | 0) + j | 0;
				g[b + (o << 2) >> 2] = +g[a + (o << 2) >> 2] * d;
				k = k + 1 | 0
			}
			j = j + 1 | 0
		} while ((j | 0) < (h | 0));
		i = l;
		return
	}
	function bj(a) {
		a = +a;
		var b = 0,
			c = 0;
		c = i;
		a = a * 32768.0;
		if (a > -32768.0) if (a < 32767.0) b = 3;
		else a = 32767.0;
		else {
			a = -32768.0;
			b = 3
		}
		b = (sa(+a) | 0) & 65535;
		i = c;
		return b | 0
	}
	function cj(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0;
		c = i;
		b = (vj(b | 0) | 0) + -32 + a | 0;
		i = c;
		return b | 0
	}
	function dj(a, b, c, d, e, f, h, j, k) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = +d;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0;
		l = i;
		k = 48e3 / (k | 0) | 0;
		e = (e | 0) / (k | 0) | 0;
		c = 1.0 - c;
		d = 1.0 - d;
		m = 0;
		while (1) {
			if ((m | 0) >= (e | 0)) break;
			o = +g[j + (($(m, k) | 0) << 2) >> 2];
			o = o * o;
			p = $(m, h) | 0;
			n = p + 1 | 0;
			o = (o * d + (1.0 - o) * c) * (+g[a + (p << 2) >> 2] - +g[a + (n << 2) >> 2]) * .5;
			p = b + (p << 2) | 0;
			g[p >> 2] = +g[p >> 2] - o;
			n = b + (n << 2) | 0;
			g[n >> 2] = +g[n >> 2] + o;
			m = m + 1 | 0
		}
		while (1) {
			if ((m | 0) >= (f | 0)) break;
			n = $(m, h) | 0;
			p = n + 1 | 0;
			o = d * (+g[a + (n << 2) >> 2] - +g[a + (p << 2) >> 2]) * .5;
			n = b + (n << 2) | 0;
			g[n >> 2] = +g[n >> 2] - o;
			p = b + (p << 2) | 0;
			g[p >> 2] = +g[p >> 2] + o;
			m = m + 1 | 0
		}
		i = l;
		return
	}
	function ej(a, d, e, f, h) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0;
		j = i;
		if ((c[a + 96 >> 2] | 0) == 2051) k = 0;
		else k = c[a + 104 >> 2] | 0;
		n = a + 100 | 0;
		m = Ti(d, e, c[a + 144 >> 2] | 0, c[n >> 2] | 0, c[a + 132 >> 2] | 0, c[a + 148 >> 2] | 0, k, 1, a + 10960 | 0) | 0;
		n = c[n >> 2] | 0;
		o = $(m, n) | 0;
		l = i;
		i = i + ((4 * o | 0) + 15 & -16) | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (o | 0)) break;
			g[l + (k << 2) >> 2] = +(b[d + (k << 1) >> 1] | 0) * 30517578125.0e-15;
			k = k + 1 | 0
		}
		o = Wi(a, l, m, f, h, 16, d, e, 0, -2, n, 1, 0) | 0;
		i = j;
		return o | 0
	}
	function fj(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0;
		g = i;
		if ((c[a + 96 >> 2] | 0) == 2051) h = 0;
		else h = c[a + 104 >> 2] | 0;
		j = a + 100 | 0;
		h = Ti(b, d, c[a + 144 >> 2] | 0, c[j >> 2] | 0, c[a + 132 >> 2] | 0, c[a + 148 >> 2] | 0, h, 2, a + 10960 | 0) | 0;
		h = Wi(a, b, h, e, f, 24, b, d, 0, -2, c[j >> 2] | 0, 2, 1) | 0;
		i = g;
		return h | 0
	}
	function gj(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		i = i + 112 | 0;
		j = f;
		h = f + 96 | 0;
		k = f + 8 | 0;
		c[h >> 2] = e;
		e = a + (c[a >> 2] | 0) | 0;
		a: do
		switch (d | 0) {
		case 4013:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 48 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4008:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				do
				if ((j | 0) >= 1101) {
					if ((j | 0) > 1105) {
						a = 100;
						break a
					}
					c[a + 116 >> 2] = j;
					if ((j | 0) == 1101) {
						c[a + 20 >> 2] = 8e3;
						h = 0;
						a = 99;
						break a
					} else if ((j | 0) == 1102) {
						c[a + 20 >> 2] = 12e3;
						h = 0;
						a = 99;
						break a
					} else break
				} else {
					if ((j | 0) != -1e3) {
						a = 100;
						break a
					}
					c[a + 116 >> 2] = j
				}
				while (0);
				c[a + 20 >> 2] = 16e3;
				h = 0;
				a = 99;
				break
			};
		case 4004:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!((j | 0) < 1101 | (j | 0) > 1105)) {
					c[a + 120 >> 2] = j;
					if ((j | 0) == 1102) {
						c[a + 20 >> 2] = 12e3;
						h = 0;
						a = 99;
						break a
					} else if ((j | 0) == 1101) {
						c[a + 20 >> 2] = 8e3;
						h = 0;
						a = 99;
						break a
					} else {
						c[a + 20 >> 2] = 16e3;
						h = 0;
						a = 99;
						break a
					}
				} else a = 100;
				break
			};
		case 4009:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 216 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4010:
			{
				d = c[h >> 2] | 0;
				k = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((k | 0) < 0 | (k | 0) > 10) a = 100;
				else {
					c[a + 44 >> 2] = k;
					c[j >> 2] = k;
					Xb(e, 4010, j) | 0;
					h = 0;
					a = 99
				}
				break
			};
		case 4002:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) != -1e3) if ((j | 0) != -1) {
					if ((j | 0) < 1) {
						a = 100;
						break a
					}
					if ((j | 0) < 501) h = 500;
					else {
						h = (c[a + 100 >> 2] | 0) * 3e5 | 0;
						h = (j | 0) > (h | 0) ? h : j
					}
				} else h = -1;
				else h = -1e3;
				c[a + 152 >> 2] = h;
				h = 0;
				a = 99;
				break
			};
		case 10024:
			{
				k = c[h >> 2] | 0;
				d = c[k >> 2] | 0;
				c[h >> 2] = k + 4;
				c[a + 164 >> 2] = d;
				c[j >> 2] = d;
				h = Xb(e, 10024, j) | 0;
				a = 99;
				break
			};
		case 4015:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 40 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4017:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 52 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4023:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 108 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4011:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 44 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4036:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 8 | (j | 0) > 24) a = 100;
				else {
					c[a + 156 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		case 4037:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 156 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4007:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 136 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 11002:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 1e3) {
					if ((j | 0) != -1e3) {
						a = 100;
						break a
					}
				} else if ((j | 0) > 1002) {
					a = 100;
					break a
				}
				c[a + 124 >> 2] = j;
				h = 0;
				a = 99;
				break
			};
		case 4028:
			{
				d = a + (c[a + 4 >> 2] | 0) | 0;
				h = a + 168 | 0;
				wj(h | 0, 0, 18052) | 0;
				Xb(e, 4028, j) | 0;
				Mf(d, c[a + 18216 >> 2] | 0, k) | 0;
				c[h >> 2] = c[a + 100 >> 2];
				b[a + 172 >> 1] = 16384;
				g[a + 180 >> 2] = 1.0;
				c[a + 224 >> 2] = 1;
				c[a + 200 >> 2] = 1001;
				c[a + 216 >> 2] = 1105;
				c[a + 176 >> 2] = (oh(60) | 0) << 8;
				h = 0;
				a = 99;
				break
			};
		case 11019:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 128 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4e3:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) == 2051 | (j | 0) == 2049 | (j | 0) == 2048) {
					h = a + 96 | 0;
					if ((c[a + 224 >> 2] | 0) == 0 ? (c[h >> 2] | 0) != (j | 0) : 0) {
						h = -1;
						a = 99;
						break a
					}
					c[h >> 2] = j;
					h = 0;
					a = 99
				} else {
					h = -1;
					a = 99
				}
				break
			};
		case 4003:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = Xi(a, c[a + 212 >> 2] | 0, 1276) | 0;
					h = 0;
					a = 99
				}
				break
			};
		case 4014:
			{
				d = c[h >> 2] | 0;
				k = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((k | 0) < 0 | (k | 0) > 100) a = 100;
				else {
					c[a + 40 >> 2] = k;
					c[j >> 2] = k;
					Xb(e, 4014, j) | 0;
					h = 0;
					a = 99
				}
				break
			};
		case 4027:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (j) {
					h = (c[a + 132 >> 2] | 0) / 400 | 0;
					c[j >> 2] = h;
					if ((c[a + 96 >> 2] | 0) == 2051) {
						h = 0;
						a = 99
					} else {
						c[j >> 2] = h + (c[a + 104 >> 2] | 0);
						h = 0;
						a = 99
					}
				} else a = 100;
				break
			};
		case 4022:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 1) {
					if ((j | 0) != -1e3) {
						a = 100;
						break a
					}
				} else if ((j | 0) > (c[a + 100 >> 2] | 0)) {
					a = 100;
					break a
				}
				c[a + 108 >> 2] = j;
				h = 0;
				a = 99;
				break
			};
		case 4040:
			{
				d = c[h >> 2] | 0;
				k = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				switch (k | 0) {
				case 5010:
				case 5006:
				case 5005:
				case 5004:
				case 5003:
				case 5002:
				case 5001:
				case 5e3:
					break;
				default:
					{
						a = 100;
						break a
					}
				}
				c[a + 144 >> 2] = k;
				c[j >> 2] = k;
				Xb(e, 4040, j) | 0;
				h = 0;
				a = 99;
				break
			};
		case 4041:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 144 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4006:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 0 | (j | 0) > 1) a = 100;
				else {
					c[a + 136 >> 2] = j;
					c[a + 56 >> 2] = 1 - j;
					h = 0;
					a = 99
				}
				break
			};
		case 4001:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 96 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4021:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 140 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4031:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 18212 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4016:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 0 | (j | 0) > 1) a = 100;
				else {
					c[a + 52 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		case 11018:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < -1 | (j | 0) > 100) a = 100;
				else {
					c[a + 128 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		case 4005:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 120 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4042:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) > 1 | (j | 0) < 0) a = 100;
				else {
					c[a + 72 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		case 4043:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 72 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4012:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 0 | (j | 0) > 1) a = 100;
				else {
					c[a + 48 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		case 4029:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 132 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 4024:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) == 3002 | (j | 0) == 3001 | (j | 0) == -1e3) {
					c[a + 112 >> 2] = j;
					h = 0;
					a = 99
				} else a = 100;
				break
			};
		case 4025:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!j) a = 100;
				else {
					c[j >> 2] = c[a + 112 >> 2];
					h = 0;
					a = 99
				}
				break
			};
		case 10026:
			{
				k = c[h >> 2] | 0;
				d = c[k >> 2] | 0;
				c[h >> 2] = k + 4;
				c[a + 228 >> 2] = d;
				c[j >> 2] = d;
				h = Xb(e, 10026, j) | 0;
				a = 99;
				break
			};
		case 10015:
			{
				d = c[h >> 2] | 0;
				a = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if (!a) a = 100;
				else {
					c[j >> 2] = a;
					h = Xb(e, 10015, j) | 0;
					a = 99
				}
				break
			};
		case 4020:
			{
				d = c[h >> 2] | 0;
				j = c[d >> 2] | 0;
				c[h >> 2] = d + 4;
				if ((j | 0) < 0 | (j | 0) > 1) a = 100;
				else {
					c[a + 140 >> 2] = j;
					h = 0;
					a = 99
				}
				break
			};
		default:
			{
				h = -5;
				a = 99
			}
		}
		while (0);
		if ((a | 0) == 99) {
			d = h;
			i = f;
			return d | 0
		} else if ((a | 0) == 100) {
			d = -1;
			i = f;
			return d | 0
		}
		return 0
	}
	function hj(a) {
		a = a | 0;
		var b = 0;
		b = i;
		Pi(a);
		i = b;
		return
	}
	function ij(a, b, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0.0,
			l = 0,
			m = 0.0,
			n = 0.0,
			o = 0.0,
			p = 0.0,
			q = 0,
			r = 0.0,
			s = 0.0;
		l = i;
		k = +(c[d >> 2] | 0) * 3.725290298461914e-9;
		o = +(c[d + 4 >> 2] | 0) * 3.725290298461914e-9;
		m = +(c[b >> 2] | 0) * 3.725290298461914e-9;
		n = +(c[b + 4 >> 2] | 0) * 3.725290298461914e-9;
		p = +(c[b + 8 >> 2] | 0) * 3.725290298461914e-9;
		b = e + 4 | 0;
		d = 0;
		while (1) {
			if ((d | 0) >= (h | 0)) break;
			q = $(d, j) | 0;
			s = +g[a + (q << 2) >> 2];
			r = +g[e >> 2] + m * s;
			g[e >> 2] = +g[b >> 2] - r * k + n * s;
			g[b >> 2] = p * s - r * o + 1.0000000031710769e-30;
			g[f + (q << 2) >> 2] = r;
			d = d + 1 | 0
		}
		i = l;
		return
	}
	function jj(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0.0,
			v = 0,
			w = 0,
			x = 0,
			y = 0.0,
			z = 0,
			A = 0;
		h = i;
		i = i + 3072 | 0;
		k = h + 1536 | 0;
		j = h;
		if ((f | 0) >= 80) if ((f | 0) > 160) l = 1.0;
		else l = (+(f | 0) + -80.0) / 80.0;
		else l = 0.0;
		m = 0;
		while (1) {
			if ((m | 0) >= 16) break;
			c[j + (m << 2) >> 2] = -1;
			g[k + (m << 2) >> 2] = 1.0e10;
			m = m + 1 | 0
		}
		m = d + 1 | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= 4) {
				m = 1;
				break
			}
			A = 1 << n;
			g[k + (A << 2) >> 2] = +((f << n) + e | 0) * (l * +kj(a, b, n, m) + 1.0);
			c[j + (A << 2) >> 2] = n;
			n = n + 1 | 0
		}
		while (1) {
			if ((m | 0) >= (d | 0)) break;
			n = m + -1 | 0;
			o = 2;
			while (1) {
				if ((o | 0) >= 16) break;
				A = o + -1 | 0;
				g[k + (m << 6) + (o << 2) >> 2] = +g[k + (n << 6) + (A << 2) >> 2];
				c[j + (m << 6) + (o << 2) >> 2] = A;
				o = o + 1 | 0
			}
			o = k + (n << 6) + 4 | 0;
			t = a + (m << 2) | 0;
			s = b + (m << 2) | 0;
			q = d - m | 0;
			r = q + 1 | 0;
			p = +(q | 0);
			v = 0;
			while (1) {
				if ((v | 0) >= 4) break;
				w = 1 << v;
				x = j + (m << 6) + (w << 2) | 0;
				c[x >> 2] = 1;
				u = +g[o >> 2];
				A = 1;
				while (1) {
					if ((A | 0) >= 4) break;
					A = A + 1 | 0;
					z = (1 << A) + -1 | 0;
					y = +g[k + (n << 6) + (z << 2) >> 2];
					if (!(y < u)) continue;
					c[x >> 2] = z;
					u = y
				}
				y = +((f << v) + e | 0) * (l * +kj(t, s, v, r) + 1.0);
				x = k + (m << 6) + (w << 2) | 0;
				g[x >> 2] = u;
				if ((q | 0) < (w | 0)) y = y * p / +(w | 0);
				g[x >> 2] = u + y;
				v = v + 1 | 0
			}
			m = m + 1 | 0
		}
		b = d + -1 | 0;
		l = +g[k + (b << 6) + 4 >> 2];
		a = 1;
		e = 2;
		while (1) {
			if ((e | 0) >= 16) break;
			y = +g[k + (b << 6) + (e << 2) >> 2];
			A = y < l;
			l = A ? y : l;
			a = A ? e : a;
			e = e + 1 | 0
		}
		while (1) {
			k = d + -1 | 0;
			if ((d | 0) <= 0) break;
			a = c[j + (k << 6) + (a << 2) >> 2] | 0;
			d = k
		}
		i = h;
		return a | 0
	}
	function kj(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0.0,
			j = 0.0,
			k = 0.0;
		e = i;
		c = 1 << c;
		d = (c | 0) < (d | 0) ? c + 1 | 0 : d;
		c = 0;
		h = 0.0;
		f = 0.0;
		while (1) {
			if ((c | 0) >= (d | 0)) break;
			k = h + +g[a + (c << 2) >> 2];
			j = f + +g[b + (c << 2) >> 2];
			c = c + 1 | 0;
			h = k;
			f = j
		}
		f = (h * f / +($(d, d) | 0) + -2.0) * .05000000074505806;
		b = f < 0.0;
		if (b) h = 0.0;
		else h = f;
		if (+P(+h) > 1.0) {
			k = 1.0;
			i = e;
			return +k
		}
		if (b) f = 0.0;
		k = +P(+f);
		i = e;
		return +k
	}
	function lj(a) {
		a = a | 0;
		c[a + 4 >> 2] = 0;
		return
	}
	function mj(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0;
		d = i;
		a = nj(a, b, c) | 0;
		i = d;
		return a | 0
	}
	function nj(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0;
		f = i;
		i = i + 16 | 0;
		j = f;
		if ((e | 0) < 1) {
			k = -4;
			i = f;
			return k | 0
		}
		g = b + 4 | 0;
		k = c[g >> 2] | 0;
		if (k) {
			if (((a[b >> 0] ^ a[d >> 0]) & 255) >= 4) {
				k = -4;
				i = f;
				return k | 0
			}
		} else {
			a[b >> 0] = a[d >> 0] | 0;
			c[b + 296 >> 2] = mi(d, 8e3) | 0
		}
		h = Gi(d, e) | 0;
		if ((h | 0) < 1) {
			k = -4;
			i = f;
			return k | 0
		}
		if (($(h + k | 0, c[b + 296 >> 2] | 0) | 0) > 960) {
			k = -4;
			i = f;
			return k | 0
		}
		b = ni(d, e, 0, j, b + (k << 2) + 8 | 0, b + (k << 1) + 200 | 0, 0, 0) | 0;
		if ((b | 0) < 1) {
			k = b;
			i = f;
			return k | 0
		}
		c[g >> 2] = (c[g >> 2] | 0) + h;
		k = 0;
		i = f;
		return k | 0
	}
	function oj(e, f, g, h, j) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		k = i;
		if ((f | 0) <= 0) {
			p = -1;
			i = k;
			return p | 0
		}
		if ((c[e + 4 >> 2] | 0) < (f | 0)) {
			p = -1;
			i = k;
			return p | 0
		}
		n = e + 200 | 0;
		do
		if ((f | 0) == 1) {
			p = b[n >> 1] | 0;
			if ((p | 0) < (h | 0)) {
				a[g >> 0] = d[e >> 0] & 252;
				o = g + 1 | 0;
				p = p + 1 | 0;
				break
			} else {
				p = -2;
				i = k;
				return p | 0
			}
		} else if ((f | 0) == 2) {
			p = b[e + 202 >> 1] | 0;
			o = b[n >> 1] | 0;
			if (p << 16 >> 16 == o << 16 >> 16) {
				p = p << 16 >> 16 << 1 | 1;
				if ((p | 0) > (h | 0)) {
					p = -2;
					i = k;
					return p | 0
				} else {
					a[g >> 0] = d[e >> 0] & 252 | 1;
					o = g + 1 | 0;
					break
				}
			} else {
				p = (o << 16 >> 16) + (p << 16 >> 16) + 2 + (o << 16 >> 16 > 251 & 1) | 0;
				if ((p | 0) > (h | 0)) {
					p = -2;
					i = k;
					return p | 0
				} else {
					a[g >> 0] = d[e >> 0] & 252 | 2;
					o = g + ((li(b[n >> 1] | 0, g + 1 | 0) | 0) + 1) | 0;
					break
				}
			}
		} else {
			o = g;
			p = 0
		}
		while (0);
		if (!((f | 0) <= 2 ? !((j | 0) != 0 & (p | 0) < (h | 0)) : 0)) {
			o = 1;
			m = 13
		}
		a: do
		if ((m | 0) == 13) {
			while (1) {
				if ((o | 0) >= (f | 0)) {
					m = 21;
					break
				}
				if ((b[e + (o << 1) + 200 >> 1] | 0) != (b[n >> 1] | 0)) {
					m = 16;
					break
				}
				o = o + 1 | 0;
				m = 13
			}
			do
			if ((m | 0) == 16) {
				n = f + -1 | 0;
				o = 0;
				m = 2;
				while (1) {
					if ((o | 0) >= (n | 0)) break;
					p = b[e + (o << 1) + 200 >> 1] | 0;
					o = o + 1 | 0;
					m = m + ((p << 16 >> 16 > 251 ? 2 : 1) + (p << 16 >> 16)) | 0
				}
				p = m + (b[e + (n << 1) + 200 >> 1] | 0) | 0;
				if ((p | 0) > (h | 0)) {
					p = -2;
					i = k;
					return p | 0
				} else {
					a[g >> 0] = d[e >> 0] | 3;
					o = f | 128;
					a[g + 1 >> 0] = o;
					n = 1;
					break
				}
			} else if ((m | 0) == 21) {
				p = ($(b[n >> 1] | 0, f) | 0) + 2 | 0;
				if ((p | 0) > (h | 0)) {
					p = -2;
					i = k;
					return p | 0
				} else {
					a[g >> 0] = d[e >> 0] | 3;
					a[g + 1 >> 0] = f;
					o = f;
					n = 0;
					break
				}
			}
			while (0);
			m = g + 2 | 0;
			if ((j | 0) != 0 ? (l = h - p | 0, (p | 0) != (h | 0)) : 0) {
				a[g + 1 >> 0] = o | 64;
				o = (l + -1 | 0) / 255 | 0;
				p = 0;
				while (1) {
					if ((p | 0) >= (o | 0)) break;
					a[m >> 0] = -1;
					m = m + 1 | 0;
					p = p + 1 | 0
				}
				a[m >> 0] = l + ($(o, -255) | 0) + 255;
				o = m + 1 | 0;
				p = h
			} else o = m;
			if (n) {
				l = f + -1 | 0;
				m = 0;
				while (1) {
					if ((m | 0) >= (l | 0)) break a;
					o = o + (li(b[e + (m << 1) + 200 >> 1] | 0, o) | 0) | 0;
					m = m + 1 | 0
				}
			}
		}
		while (0);
		l = 0;
		while (1) {
			if ((l | 0) >= (f | 0)) break;
			n = e + (l << 1) + 200 | 0;
			zj(o | 0, c[e + (l << 2) + 8 >> 2] | 0, b[n >> 1] | 0) | 0;
			o = o + (b[n >> 1] | 0) | 0;
			l = l + 1 | 0
		}
		if (!j) {
			i = k;
			return p | 0
		}
		g = g + h | 0;
		while (1) {
			if (o >>> 0 >= g >>> 0) break;
			a[o >> 0] = 0;
			o = o + 1 | 0
		}
		i = k;
		return p | 0
	}
	function pj(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		e = i;
		i = i + 304 | 0;
		f = e;
		if ((b | 0) < 1) {
			b = -1;
			i = e;
			return b | 0
		}
		if ((b | 0) == (d | 0)) {
			b = 0;
			i = e;
			return b | 0
		}
		if ((b | 0) > (d | 0)) {
			b = -1;
			i = e;
			return b | 0
		} else {
			lj(f);
			g = a + (d - b) | 0;
			zj(g | 0, a | 0, b | 0) | 0;
			mj(f, g, b) | 0;
			b = oj(f, c[f + 4 >> 2] | 0, a, d, 1) | 0;
			i = e;
			return ((b | 0) > 0 ? 0 : b) | 0
		}
		return 0
	}



	function qj(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0;
		b = i;
		do
		if (a >>> 0 < 245) {
			if (a >>> 0 < 11) a = 16;
			else a = a + 11 & -8;
			v = a >>> 3;
			p = c[7654] | 0;
			w = p >>> v;
			if (w & 3) {
				h = (w & 1 ^ 1) + v | 0;
				g = h << 1;
				e = 30656 + (g << 2) | 0;
				g = 30656 + (g + 2 << 2) | 0;
				j = c[g >> 2] | 0;
				d = j + 8 | 0;
				f = c[d >> 2] | 0;
				do
				if ((e | 0) != (f | 0)) {
					if (f >>> 0 < (c[7658] | 0) >>> 0) xa();
					k = f + 12 | 0;
					if ((c[k >> 2] | 0) == (j | 0)) {
						c[k >> 2] = e;
						c[g >> 2] = f;
						break
					} else xa()
				} else c[7654] = p & ~ (1 << h);
				while (0);
				H = h << 3;
				c[j + 4 >> 2] = H | 3;
				H = j + (H | 4) | 0;
				c[H >> 2] = c[H >> 2] | 1;
				H = d;
				i = b;
				return H | 0
			}
			if (a >>> 0 > (c[7656] | 0) >>> 0) {
				if (w) {
					h = 2 << v;
					h = w << v & (h | 0 - h);
					h = (h & 0 - h) + -1 | 0;
					d = h >>> 12 & 16;
					h = h >>> d;
					f = h >>> 5 & 8;
					h = h >>> f;
					g = h >>> 2 & 4;
					h = h >>> g;
					e = h >>> 1 & 2;
					h = h >>> e;
					j = h >>> 1 & 1;
					j = (f | d | g | e | j) + (h >>> j) | 0;
					h = j << 1;
					e = 30656 + (h << 2) | 0;
					h = 30656 + (h + 2 << 2) | 0;
					g = c[h >> 2] | 0;
					d = g + 8 | 0;
					f = c[d >> 2] | 0;
					do
					if ((e | 0) != (f | 0)) {
						if (f >>> 0 < (c[7658] | 0) >>> 0) xa();
						k = f + 12 | 0;
						if ((c[k >> 2] | 0) == (g | 0)) {
							c[k >> 2] = e;
							c[h >> 2] = f;
							break
						} else xa()
					} else c[7654] = p & ~ (1 << j);
					while (0);
					h = j << 3;
					f = h - a | 0;
					c[g + 4 >> 2] = a | 3;
					e = g + a | 0;
					c[g + (a | 4) >> 2] = f | 1;
					c[g + h >> 2] = f;
					h = c[7656] | 0;
					if (h) {
						g = c[7659] | 0;
						k = h >>> 3;
						j = k << 1;
						h = 30656 + (j << 2) | 0;
						l = c[7654] | 0;
						k = 1 << k;
						if (l & k) {
							j = 30656 + (j + 2 << 2) | 0;
							k = c[j >> 2] | 0;
							if (k >>> 0 < (c[7658] | 0) >>> 0) xa();
							else {
								D = j;
								C = k
							}
						} else {
							c[7654] = l | k;
							D = 30656 + (j + 2 << 2) | 0;
							C = h
						}
						c[D >> 2] = g;
						c[C + 12 >> 2] = g;
						c[g + 8 >> 2] = C;
						c[g + 12 >> 2] = h
					}
					c[7656] = f;
					c[7659] = e;
					H = d;
					i = b;
					return H | 0
				}
				p = c[7655] | 0;
				if (p) {
					e = (p & 0 - p) + -1 | 0;
					G = e >>> 12 & 16;
					e = e >>> G;
					F = e >>> 5 & 8;
					e = e >>> F;
					H = e >>> 2 & 4;
					e = e >>> H;
					f = e >>> 1 & 2;
					e = e >>> f;
					d = e >>> 1 & 1;
					d = c[30920 + ((F | G | H | f | d) + (e >>> d) << 2) >> 2] | 0;
					e = (c[d + 4 >> 2] & -8) - a | 0;
					f = d;
					while (1) {
						g = c[f + 16 >> 2] | 0;
						if (!g) {
							g = c[f + 20 >> 2] | 0;
							if (!g) break
						}
						f = (c[g + 4 >> 2] & -8) - a | 0;
						H = f >>> 0 < e >>> 0;
						e = H ? f : e;
						f = g;
						d = H ? g : d
					}
					h = c[7658] | 0;
					if (d >>> 0 < h >>> 0) xa();
					f = d + a | 0;
					if (d >>> 0 >= f >>> 0) xa();
					g = c[d + 24 >> 2] | 0;
					k = c[d + 12 >> 2] | 0;
					do
					if ((k | 0) == (d | 0)) {
						k = d + 20 | 0;
						j = c[k >> 2] | 0;
						if (!j) {
							k = d + 16 | 0;
							j = c[k >> 2] | 0;
							if (!j) {
								B = 0;
								break
							}
						}
						while (1) {
							l = j + 20 | 0;
							m = c[l >> 2] | 0;
							if (m) {
								j = m;
								k = l;
								continue
							}
							m = j + 16 | 0;
							l = c[m >> 2] | 0;
							if (!l) break;
							else {
								j = l;
								k = m
							}
						}
						if (k >>> 0 < h >>> 0) xa();
						else {
							c[k >> 2] = 0;
							B = j;
							break
						}
					} else {
						j = c[d + 8 >> 2] | 0;
						if (j >>> 0 < h >>> 0) xa();
						h = j + 12 | 0;
						if ((c[h >> 2] | 0) != (d | 0)) xa();
						l = k + 8 | 0;
						if ((c[l >> 2] | 0) == (d | 0)) {
							c[h >> 2] = k;
							c[l >> 2] = j;
							B = k;
							break
						} else xa()
					}
					while (0);
					do
					if (g) {
						h = c[d + 28 >> 2] | 0;
						j = 30920 + (h << 2) | 0;
						if ((d | 0) == (c[j >> 2] | 0)) {
							c[j >> 2] = B;
							if (!B) {
								c[7655] = c[7655] & ~ (1 << h);
								break
							}
						} else {
							if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
							h = g + 16 | 0;
							if ((c[h >> 2] | 0) == (d | 0)) c[h >> 2] = B;
							else c[g + 20 >> 2] = B;
							if (!B) break
						}
						if (B >>> 0 < (c[7658] | 0) >>> 0) xa();
						c[B + 24 >> 2] = g;
						g = c[d + 16 >> 2] | 0;
						do
						if (g) if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
						else {
							c[B + 16 >> 2] = g;
							c[g + 24 >> 2] = B;
							break
						}
						while (0);
						g = c[d + 20 >> 2] | 0;
						if (g) if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
						else {
							c[B + 20 >> 2] = g;
							c[g + 24 >> 2] = B;
							break
						}
					}
					while (0);
					if (e >>> 0 < 16) {
						H = e + a | 0;
						c[d + 4 >> 2] = H | 3;
						H = d + (H + 4) | 0;
						c[H >> 2] = c[H >> 2] | 1
					} else {
						c[d + 4 >> 2] = a | 3;
						c[d + (a | 4) >> 2] = e | 1;
						c[d + (e + a) >> 2] = e;
						h = c[7656] | 0;
						if (h) {
							g = c[7659] | 0;
							l = h >>> 3;
							j = l << 1;
							h = 30656 + (j << 2) | 0;
							k = c[7654] | 0;
							l = 1 << l;
							if (k & l) {
								j = 30656 + (j + 2 << 2) | 0;
								k = c[j >> 2] | 0;
								if (k >>> 0 < (c[7658] | 0) >>> 0) xa();
								else {
									A = j;
									z = k
								}
							} else {
								c[7654] = k | l;
								A = 30656 + (j + 2 << 2) | 0;
								z = h
							}
							c[A >> 2] = g;
							c[z + 12 >> 2] = g;
							c[g + 8 >> 2] = z;
							c[g + 12 >> 2] = h
						}
						c[7656] = e;
						c[7659] = f
					}
					H = d + 8 | 0;
					i = b;
					return H | 0
				}
			}
		} else if (a >>> 0 <= 4294967231) {
			z = a + 11 | 0;
			a = z & -8;
			B = c[7655] | 0;
			if (B) {
				A = 0 - a | 0;
				z = z >>> 8;
				if (z) if (a >>> 0 > 16777215) C = 31;
				else {
					G = (z + 1048320 | 0) >>> 16 & 8;
					H = z << G;
					F = (H + 520192 | 0) >>> 16 & 4;
					H = H << F;
					C = (H + 245760 | 0) >>> 16 & 2;
					C = 14 - (F | G | C) + (H << C >>> 15) | 0;
					C = a >>> (C + 7 | 0) & 1 | C << 1
				} else C = 0;
				D = c[30920 + (C << 2) >> 2] | 0;
				a: do
				if (!D) {
					F = 0;
					z = 0
				} else {
					if ((C | 0) == 31) z = 0;
					else z = 25 - (C >>> 1) | 0;
					F = 0;
					E = a << z;
					z = 0;
					while (1) {
						H = c[D + 4 >> 2] & -8;
						G = H - a | 0;
						if (G >>> 0 < A >>> 0) if ((H | 0) == (a | 0)) {
							A = G;
							F = D;
							z = D;
							break a
						} else {
							A = G;
							z = D
						}
						H = c[D + 20 >> 2] | 0;
						D = c[D + (E >>> 31 << 2) + 16 >> 2] | 0;
						F = (H | 0) == 0 | (H | 0) == (D | 0) ? F : H;
						if (!D) break;
						else E = E << 1
					}
				}
				while (0);
				if ((F | 0) == 0 & (z | 0) == 0) {
					H = 2 << C;
					B = B & (H | 0 - H);
					if (!B) break;
					H = (B & 0 - B) + -1 | 0;
					D = H >>> 12 & 16;
					H = H >>> D;
					C = H >>> 5 & 8;
					H = H >>> C;
					E = H >>> 2 & 4;
					H = H >>> E;
					G = H >>> 1 & 2;
					H = H >>> G;
					F = H >>> 1 & 1;
					F = c[30920 + ((C | D | E | G | F) + (H >>> F) << 2) >> 2] | 0
				}
				if (F) while (1) {
					H = (c[F + 4 >> 2] & -8) - a | 0;
					B = H >>> 0 < A >>> 0;
					A = B ? H : A;
					z = B ? F : z;
					B = c[F + 16 >> 2] | 0;
					if (B) {
						F = B;
						continue
					}
					F = c[F + 20 >> 2] | 0;
					if (!F) break
				}
				if ((z | 0) != 0 ? A >>> 0 < ((c[7656] | 0) - a | 0) >>> 0 : 0) {
					f = c[7658] | 0;
					if (z >>> 0 < f >>> 0) xa();
					d = z + a | 0;
					if (z >>> 0 >= d >>> 0) xa();
					e = c[z + 24 >> 2] | 0;
					h = c[z + 12 >> 2] | 0;
					do
					if ((h | 0) == (z | 0)) {
						h = z + 20 | 0;
						g = c[h >> 2] | 0;
						if (!g) {
							h = z + 16 | 0;
							g = c[h >> 2] | 0;
							if (!g) {
								x = 0;
								break
							}
						}
						while (1) {
							j = g + 20 | 0;
							k = c[j >> 2] | 0;
							if (k) {
								g = k;
								h = j;
								continue
							}
							j = g + 16 | 0;
							k = c[j >> 2] | 0;
							if (!k) break;
							else {
								g = k;
								h = j
							}
						}
						if (h >>> 0 < f >>> 0) xa();
						else {
							c[h >> 2] = 0;
							x = g;
							break
						}
					} else {
						g = c[z + 8 >> 2] | 0;
						if (g >>> 0 < f >>> 0) xa();
						f = g + 12 | 0;
						if ((c[f >> 2] | 0) != (z | 0)) xa();
						j = h + 8 | 0;
						if ((c[j >> 2] | 0) == (z | 0)) {
							c[f >> 2] = h;
							c[j >> 2] = g;
							x = h;
							break
						} else xa()
					}
					while (0);
					do
					if (e) {
						g = c[z + 28 >> 2] | 0;
						f = 30920 + (g << 2) | 0;
						if ((z | 0) == (c[f >> 2] | 0)) {
							c[f >> 2] = x;
							if (!x) {
								c[7655] = c[7655] & ~ (1 << g);
								break
							}
						} else {
							if (e >>> 0 < (c[7658] | 0) >>> 0) xa();
							f = e + 16 | 0;
							if ((c[f >> 2] | 0) == (z | 0)) c[f >> 2] = x;
							else c[e + 20 >> 2] = x;
							if (!x) break
						}
						if (x >>> 0 < (c[7658] | 0) >>> 0) xa();
						c[x + 24 >> 2] = e;
						e = c[z + 16 >> 2] | 0;
						do
						if (e) if (e >>> 0 < (c[7658] | 0) >>> 0) xa();
						else {
							c[x + 16 >> 2] = e;
							c[e + 24 >> 2] = x;
							break
						}
						while (0);
						e = c[z + 20 >> 2] | 0;
						if (e) if (e >>> 0 < (c[7658] | 0) >>> 0) xa();
						else {
							c[x + 20 >> 2] = e;
							c[e + 24 >> 2] = x;
							break
						}
					}
					while (0);
					b: do
					if (A >>> 0 >= 16) {
						c[z + 4 >> 2] = a | 3;
						c[z + (a | 4) >> 2] = A | 1;
						c[z + (A + a) >> 2] = A;
						f = A >>> 3;
						if (A >>> 0 < 256) {
							h = f << 1;
							e = 30656 + (h << 2) | 0;
							g = c[7654] | 0;
							f = 1 << f;
							do
							if (!(g & f)) {
								c[7654] = g | f;
								w = 30656 + (h + 2 << 2) | 0;
								v = e
							} else {
								f = 30656 + (h + 2 << 2) | 0;
								g = c[f >> 2] | 0;
								if (g >>> 0 >= (c[7658] | 0) >>> 0) {
									w = f;
									v = g;
									break
								}
								xa()
							}
							while (0);
							c[w >> 2] = d;
							c[v + 12 >> 2] = d;
							c[z + (a + 8) >> 2] = v;
							c[z + (a + 12) >> 2] = e;
							break
						}
						e = A >>> 8;
						if (e) if (A >>> 0 > 16777215) e = 31;
						else {
							G = (e + 1048320 | 0) >>> 16 & 8;
							H = e << G;
							F = (H + 520192 | 0) >>> 16 & 4;
							H = H << F;
							e = (H + 245760 | 0) >>> 16 & 2;
							e = 14 - (F | G | e) + (H << e >>> 15) | 0;
							e = A >>> (e + 7 | 0) & 1 | e << 1
						} else e = 0;
						f = 30920 + (e << 2) | 0;
						c[z + (a + 28) >> 2] = e;
						c[z + (a + 20) >> 2] = 0;
						c[z + (a + 16) >> 2] = 0;
						h = c[7655] | 0;
						g = 1 << e;
						if (!(h & g)) {
							c[7655] = h | g;
							c[f >> 2] = d;
							c[z + (a + 24) >> 2] = f;
							c[z + (a + 12) >> 2] = d;
							c[z + (a + 8) >> 2] = d;
							break
						}
						f = c[f >> 2] | 0;
						if ((e | 0) == 31) e = 0;
						else e = 25 - (e >>> 1) | 0;
						c: do
						if ((c[f + 4 >> 2] & -8 | 0) != (A | 0)) {
							e = A << e;
							while (1) {
								g = f + (e >>> 31 << 2) + 16 | 0;
								h = c[g >> 2] | 0;
								if (!h) break;
								if ((c[h + 4 >> 2] & -8 | 0) == (A | 0)) {
									p = h;
									break c
								} else {
									e = e << 1;
									f = h
								}
							}
							if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
							else {
								c[g >> 2] = d;
								c[z + (a + 24) >> 2] = f;
								c[z + (a + 12) >> 2] = d;
								c[z + (a + 8) >> 2] = d;
								break b
							}
						} else p = f;
						while (0);
						f = p + 8 | 0;
						e = c[f >> 2] | 0;
						g = c[7658] | 0;
						if (p >>> 0 < g >>> 0) xa();
						if (e >>> 0 < g >>> 0) xa();
						else {
							c[e + 12 >> 2] = d;
							c[f >> 2] = d;
							c[z + (a + 8) >> 2] = e;
							c[z + (a + 12) >> 2] = p;
							c[z + (a + 24) >> 2] = 0;
							break
						}
					} else {
						H = A + a | 0;
						c[z + 4 >> 2] = H | 3;
						H = z + (H + 4) | 0;
						c[H >> 2] = c[H >> 2] | 1
					}
					while (0);
					H = z + 8 | 0;
					i = b;
					return H | 0
				}
			}
		} else a = -1;
		while (0);
		p = c[7656] | 0;
		if (a >>> 0 <= p >>> 0) {
			e = p - a | 0;
			d = c[7659] | 0;
			if (e >>> 0 > 15) {
				c[7659] = d + a;
				c[7656] = e;
				c[d + (a + 4) >> 2] = e | 1;
				c[d + p >> 2] = e;
				c[d + 4 >> 2] = a | 3
			} else {
				c[7656] = 0;
				c[7659] = 0;
				c[d + 4 >> 2] = p | 3;
				H = d + (p + 4) | 0;
				c[H >> 2] = c[H >> 2] | 1
			}
			H = d + 8 | 0;
			i = b;
			return H | 0
		}
		p = c[7657] | 0;
		if (a >>> 0 < p >>> 0) {
			G = p - a | 0;
			c[7657] = G;
			H = c[7660] | 0;
			c[7660] = H + a;
			c[H + (a + 4) >> 2] = G | 1;
			c[H + 4 >> 2] = a | 3;
			H = H + 8 | 0;
			i = b;
			return H | 0
		}
		do
		if (!(c[7772] | 0)) {
			p = qa(30) | 0;
			if (!(p + -1 & p)) {
				c[7774] = p;
				c[7773] = p;
				c[7775] = -1;
				c[7776] = -1;
				c[7777] = 0;
				c[7765] = 0;
				c[7772] = (ya(0) | 0) & -16 ^ 1431655768;
				break
			} else xa()
		}
		while (0);
		w = a + 48 | 0;
		p = c[7774] | 0;
		x = a + 47 | 0;
		z = p + x | 0;
		p = 0 - p | 0;
		v = z & p;
		if (v >>> 0 <= a >>> 0) {
			H = 0;
			i = b;
			return H | 0
		}
		A = c[7764] | 0;
		if ((A | 0) != 0 ? (G = c[7762] | 0, H = G + v | 0, H >>> 0 <= G >>> 0 | H >>> 0 > A >>> 0) : 0) {
			H = 0;
			i = b;
			return H | 0
		}
		d: do
		if (!(c[7765] & 4)) {
			B = c[7660] | 0;
			e: do
			if (B) {
				A = 31064 | 0;
				while (1) {
					C = c[A >> 2] | 0;
					if (C >>> 0 <= B >>> 0 ? (y = A + 4 | 0, (C + (c[y >> 2] | 0) | 0) >>> 0 > B >>> 0) : 0) break;
					A = c[A + 8 >> 2] | 0;
					if (!A) {
						o = 182;
						break e
					}
				}
				if (A) {
					B = z - (c[7657] | 0) & p;
					if (B >>> 0 < 2147483647) {
						p = na(B | 0) | 0;
						A = (p | 0) == ((c[A >> 2] | 0) + (c[y >> 2] | 0) | 0);
						y = p;
						z = B;
						p = A ? p : -1;
						A = A ? B : 0;
						o = 191
					} else A = 0
				} else o = 182
			} else o = 182;
			while (0);
			do
			if ((o | 0) == 182) {
				p = na(0) | 0;
				if ((p | 0) != (-1 | 0)) {
					z = p;
					A = c[7773] | 0;
					y = A + -1 | 0;
					if (!(y & z)) A = v;
					else A = v - z + (y + z & 0 - A) | 0;
					y = c[7762] | 0;
					z = y + A | 0;
					if (A >>> 0 > a >>> 0 & A >>> 0 < 2147483647) {
						H = c[7764] | 0;
						if ((H | 0) != 0 ? z >>> 0 <= y >>> 0 | z >>> 0 > H >>> 0 : 0) {
							A = 0;
							break
						}
						y = na(A | 0) | 0;
						o = (y | 0) == (p | 0);
						z = A;
						p = o ? p : -1;
						A = o ? A : 0;
						o = 191
					} else A = 0
				} else A = 0
			}
			while (0);
			f: do
			if ((o | 0) == 191) {
				o = 0 - z | 0;
				if ((p | 0) != (-1 | 0)) {
					q = A;
					o = 202;
					break d
				}
				do
				if ((y | 0) != (-1 | 0) & z >>> 0 < 2147483647 & z >>> 0 < w >>> 0 ? (u = c[7774] | 0, u = x - z + u & 0 - u, u >>> 0 < 2147483647) : 0) if ((na(u | 0) | 0) == (-1 | 0)) {
					na(o | 0) | 0;
					break f
				} else {
					z = u + z | 0;
					break
				}
				while (0);
				if ((y | 0) != (-1 | 0)) {
					p = y;
					q = z;
					o = 202;
					break d
				}
			}
			while (0);
			c[7765] = c[7765] | 4;
			o = 199
		} else {
			A = 0;
			o = 199
		}
		while (0);
		if ((((o | 0) == 199 ? v >>> 0 < 2147483647 : 0) ? (t = na(v | 0) | 0, s = na(0) | 0, (s | 0) != (-1 | 0) & (t | 0) != (-1 | 0) & t >>> 0 < s >>> 0) : 0) ? (r = s - t | 0, q = r >>> 0 > (a + 40 | 0) >>> 0, q) : 0) {
			p = t;
			q = q ? r : A;
			o = 202
		}
		if ((o | 0) == 202) {
			r = (c[7762] | 0) + q | 0;
			c[7762] = r;
			if (r >>> 0 > (c[7763] | 0) >>> 0) c[7763] = r;
			r = c[7660] | 0;
			g: do
			if (r) {
				v = 31064 | 0;
				while (1) {
					t = c[v >> 2] | 0;
					u = v + 4 | 0;
					s = c[u >> 2] | 0;
					if ((p | 0) == (t + s | 0)) {
						o = 214;
						break
					}
					w = c[v + 8 >> 2] | 0;
					if (!w) break;
					else v = w
				}
				if (((o | 0) == 214 ? (c[v + 12 >> 2] & 8 | 0) == 0 : 0) ? r >>> 0 >= t >>> 0 & r >>> 0 < p >>> 0 : 0) {
					c[u >> 2] = s + q;
					d = (c[7657] | 0) + q | 0;
					e = r + 8 | 0;
					if (!(e & 7)) e = 0;
					else e = 0 - e & 7;
					H = d - e | 0;
					c[7660] = r + e;
					c[7657] = H;
					c[r + (e + 4) >> 2] = H | 1;
					c[r + (d + 4) >> 2] = 40;
					c[7661] = c[7776];
					break
				}
				if (p >>> 0 < (c[7658] | 0) >>> 0) c[7658] = p;
				t = p + q | 0;
				s = 31064 | 0;
				while (1) {
					if ((c[s >> 2] | 0) == (t | 0)) {
						o = 224;
						break
					}
					u = c[s + 8 >> 2] | 0;
					if (!u) break;
					else s = u
				}
				if ((o | 0) == 224 ? (c[s + 12 >> 2] & 8 | 0) == 0 : 0) {
					c[s >> 2] = p;
					h = s + 4 | 0;
					c[h >> 2] = (c[h >> 2] | 0) + q;
					h = p + 8 | 0;
					if (!(h & 7)) h = 0;
					else h = 0 - h & 7;
					j = p + (q + 8) | 0;
					if (!(j & 7)) n = 0;
					else n = 0 - j & 7;
					o = p + (n + q) | 0;
					j = h + a | 0;
					k = p + j | 0;
					m = o - (p + h) - a | 0;
					c[p + (h + 4) >> 2] = a | 3;
					h: do
					if ((o | 0) != (c[7660] | 0)) {
						if ((o | 0) == (c[7659] | 0)) {
							H = (c[7656] | 0) + m | 0;
							c[7656] = H;
							c[7659] = k;
							c[p + (j + 4) >> 2] = H | 1;
							c[p + (H + j) >> 2] = H;
							break
						}
						r = q + 4 | 0;
						t = c[p + (r + n) >> 2] | 0;
						if ((t & 3 | 0) == 1) {
							a = t & -8;
							s = t >>> 3;
							i: do
							if (t >>> 0 >= 256) {
								l = c[p + ((n | 24) + q) >> 2] | 0;
								u = c[p + (q + 12 + n) >> 2] | 0;
								do
								if ((u | 0) == (o | 0)) {
									u = n | 16;
									t = p + (r + u) | 0;
									s = c[t >> 2] | 0;
									if (!s) {
										t = p + (u + q) | 0;
										s = c[t >> 2] | 0;
										if (!s) {
											g = 0;
											break
										}
									}
									while (1) {
										u = s + 20 | 0;
										v = c[u >> 2] | 0;
										if (v) {
											s = v;
											t = u;
											continue
										}
										u = s + 16 | 0;
										v = c[u >> 2] | 0;
										if (!v) break;
										else {
											s = v;
											t = u
										}
									}
									if (t >>> 0 < (c[7658] | 0) >>> 0) xa();
									else {
										c[t >> 2] = 0;
										g = s;
										break
									}
								} else {
									t = c[p + ((n | 8) + q) >> 2] | 0;
									if (t >>> 0 < (c[7658] | 0) >>> 0) xa();
									v = t + 12 | 0;
									if ((c[v >> 2] | 0) != (o | 0)) xa();
									s = u + 8 | 0;
									if ((c[s >> 2] | 0) == (o | 0)) {
										c[v >> 2] = u;
										c[s >> 2] = t;
										g = u;
										break
									} else xa()
								}
								while (0);
								if (!l) break;
								t = c[p + (q + 28 + n) >> 2] | 0;
								s = 30920 + (t << 2) | 0;
								do
								if ((o | 0) != (c[s >> 2] | 0)) {
									if (l >>> 0 < (c[7658] | 0) >>> 0) xa();
									s = l + 16 | 0;
									if ((c[s >> 2] | 0) == (o | 0)) c[s >> 2] = g;
									else c[l + 20 >> 2] = g;
									if (!g) break i
								} else {
									c[s >> 2] = g;
									if (g) break;
									c[7655] = c[7655] & ~ (1 << t);
									break i
								}
								while (0);
								if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
								c[g + 24 >> 2] = l;
								l = n | 16;
								o = c[p + (l + q) >> 2] | 0;
								do
								if (o) if (o >>> 0 < (c[7658] | 0) >>> 0) xa();
								else {
									c[g + 16 >> 2] = o;
									c[o + 24 >> 2] = g;
									break
								}
								while (0);
								l = c[p + (r + l) >> 2] | 0;
								if (!l) break;
								if (l >>> 0 < (c[7658] | 0) >>> 0) xa();
								else {
									c[g + 20 >> 2] = l;
									c[l + 24 >> 2] = g;
									break
								}
							} else {
								r = c[p + ((n | 8) + q) >> 2] | 0;
								g = c[p + (q + 12 + n) >> 2] | 0;
								t = 30656 + (s << 1 << 2) | 0;
								do
								if ((r | 0) != (t | 0)) {
									if (r >>> 0 < (c[7658] | 0) >>> 0) xa();
									if ((c[r + 12 >> 2] | 0) == (o | 0)) break;
									xa()
								}
								while (0);
								if ((g | 0) == (r | 0)) {
									c[7654] = c[7654] & ~ (1 << s);
									break
								}
								do
								if ((g | 0) == (t | 0)) l = g + 8 | 0;
								else {
									if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
									s = g + 8 | 0;
									if ((c[s >> 2] | 0) == (o | 0)) {
										l = s;
										break
									}
									xa()
								}
								while (0);
								c[r + 12 >> 2] = g;
								c[l >> 2] = r
							}
							while (0);
							o = p + ((a | n) + q) | 0;
							m = a + m | 0
						}
						g = o + 4 | 0;
						c[g >> 2] = c[g >> 2] & -2;
						c[p + (j + 4) >> 2] = m | 1;
						c[p + (m + j) >> 2] = m;
						g = m >>> 3;
						if (m >>> 0 < 256) {
							m = g << 1;
							d = 30656 + (m << 2) | 0;
							l = c[7654] | 0;
							g = 1 << g;
							do
							if (!(l & g)) {
								c[7654] = l | g;
								f = 30656 + (m + 2 << 2) | 0;
								e = d
							} else {
								l = 30656 + (m + 2 << 2) | 0;
								g = c[l >> 2] | 0;
								if (g >>> 0 >= (c[7658] | 0) >>> 0) {
									f = l;
									e = g;
									break
								}
								xa()
							}
							while (0);
							c[f >> 2] = k;
							c[e + 12 >> 2] = k;
							c[p + (j + 8) >> 2] = e;
							c[p + (j + 12) >> 2] = d;
							break
						}
						e = m >>> 8;
						do
						if (!e) e = 0;
						else {
							if (m >>> 0 > 16777215) {
								e = 31;
								break
							}
							G = (e + 1048320 | 0) >>> 16 & 8;
							H = e << G;
							F = (H + 520192 | 0) >>> 16 & 4;
							H = H << F;
							e = (H + 245760 | 0) >>> 16 & 2;
							e = 14 - (F | G | e) + (H << e >>> 15) | 0;
							e = m >>> (e + 7 | 0) & 1 | e << 1
						}
						while (0);
						l = 30920 + (e << 2) | 0;
						c[p + (j + 28) >> 2] = e;
						c[p + (j + 20) >> 2] = 0;
						c[p + (j + 16) >> 2] = 0;
						f = c[7655] | 0;
						g = 1 << e;
						if (!(f & g)) {
							c[7655] = f | g;
							c[l >> 2] = k;
							c[p + (j + 24) >> 2] = l;
							c[p + (j + 12) >> 2] = k;
							c[p + (j + 8) >> 2] = k;
							break
						}
						l = c[l >> 2] | 0;
						if ((e | 0) == 31) e = 0;
						else e = 25 - (e >>> 1) | 0;
						j: do
						if ((c[l + 4 >> 2] & -8 | 0) != (m | 0)) {
							e = m << e;
							while (1) {
								g = l + (e >>> 31 << 2) + 16 | 0;
								f = c[g >> 2] | 0;
								if (!f) break;
								if ((c[f + 4 >> 2] & -8 | 0) == (m | 0)) {
									d = f;
									break j
								} else {
									e = e << 1;
									l = f
								}
							}
							if (g >>> 0 < (c[7658] | 0) >>> 0) xa();
							else {
								c[g >> 2] = k;
								c[p + (j + 24) >> 2] = l;
								c[p + (j + 12) >> 2] = k;
								c[p + (j + 8) >> 2] = k;
								break h
							}
						} else d = l;
						while (0);
						f = d + 8 | 0;
						e = c[f >> 2] | 0;
						g = c[7658] | 0;
						if (d >>> 0 < g >>> 0) xa();
						if (e >>> 0 < g >>> 0) xa();
						else {
							c[e + 12 >> 2] = k;
							c[f >> 2] = k;
							c[p + (j + 8) >> 2] = e;
							c[p + (j + 12) >> 2] = d;
							c[p + (j + 24) >> 2] = 0;
							break
						}
					} else {
						H = (c[7657] | 0) + m | 0;
						c[7657] = H;
						c[7660] = k;
						c[p + (j + 4) >> 2] = H | 1
					}
					while (0);
					H = p + (h | 8) | 0;
					i = b;
					return H | 0
				}
				e = 31064 | 0;
				while (1) {
					d = c[e >> 2] | 0;
					if (d >>> 0 <= r >>> 0 ? (n = c[e + 4 >> 2] | 0, m = d + n | 0, m >>> 0 > r >>> 0) : 0) break;
					e = c[e + 8 >> 2] | 0
				}
				e = d + (n + -39) | 0;
				if (!(e & 7)) e = 0;
				else e = 0 - e & 7;
				d = d + (n + -47 + e) | 0;
				d = d >>> 0 < (r + 16 | 0) >>> 0 ? r : d;
				e = d + 8 | 0;
				f = p + 8 | 0;
				if (!(f & 7)) f = 0;
				else f = 0 - f & 7;
				H = q + -40 - f | 0;
				c[7660] = p + f;
				c[7657] = H;
				c[p + (f + 4) >> 2] = H | 1;
				c[p + (q + -36) >> 2] = 40;
				c[7661] = c[7776];
				c[d + 4 >> 2] = 27;
				c[e + 0 >> 2] = c[7766];
				c[e + 4 >> 2] = c[7767];
				c[e + 8 >> 2] = c[7768];
				c[e + 12 >> 2] = c[7769];
				c[7766] = p;
				c[7767] = q;
				c[7769] = 0;
				c[7768] = e;
				e = d + 28 | 0;
				c[e >> 2] = 7;
				if ((d + 32 | 0) >>> 0 < m >>> 0) do {
					H = e;
					e = e + 4 | 0;
					c[e >> 2] = 7
				} while ((H + 8 | 0) >>> 0 < m >>> 0);
				if ((d | 0) != (r | 0)) {
					d = d - r | 0;
					e = r + (d + 4) | 0;
					c[e >> 2] = c[e >> 2] & -2;
					c[r + 4 >> 2] = d | 1;
					c[r + d >> 2] = d;
					e = d >>> 3;
					if (d >>> 0 < 256) {
						g = e << 1;
						d = 30656 + (g << 2) | 0;
						f = c[7654] | 0;
						e = 1 << e;
						do
						if (!(f & e)) {
							c[7654] = f | e;
							k = 30656 + (g + 2 << 2) | 0;
							j = d
						} else {
							f = 30656 + (g + 2 << 2) | 0;
							e = c[f >> 2] | 0;
							if (e >>> 0 >= (c[7658] | 0) >>> 0) {
								k = f;
								j = e;
								break
							}
							xa()
						}
						while (0);
						c[k >> 2] = r;
						c[j + 12 >> 2] = r;
						c[r + 8 >> 2] = j;
						c[r + 12 >> 2] = d;
						break
					}
					e = d >>> 8;
					if (e) if (d >>> 0 > 16777215) e = 31;
					else {
						G = (e + 1048320 | 0) >>> 16 & 8;
						H = e << G;
						F = (H + 520192 | 0) >>> 16 & 4;
						H = H << F;
						e = (H + 245760 | 0) >>> 16 & 2;
						e = 14 - (F | G | e) + (H << e >>> 15) | 0;
						e = d >>> (e + 7 | 0) & 1 | e << 1
					} else e = 0;
					j = 30920 + (e << 2) | 0;
					c[r + 28 >> 2] = e;
					c[r + 20 >> 2] = 0;
					c[r + 16 >> 2] = 0;
					f = c[7655] | 0;
					g = 1 << e;
					if (!(f & g)) {
						c[7655] = f | g;
						c[j >> 2] = r;
						c[r + 24 >> 2] = j;
						c[r + 12 >> 2] = r;
						c[r + 8 >> 2] = r;
						break
					}
					f = c[j >> 2] | 0;
					if ((e | 0) == 31) e = 0;
					else e = 25 - (e >>> 1) | 0;
					k: do
					if ((c[f + 4 >> 2] & -8 | 0) != (d | 0)) {
						e = d << e;
						while (1) {
							j = f + (e >>> 31 << 2) + 16 | 0;
							g = c[j >> 2] | 0;
							if (!g) break;
							if ((c[g + 4 >> 2] & -8 | 0) == (d | 0)) {
								h = g;
								break k
							} else {
								e = e << 1;
								f = g
							}
						}
						if (j >>> 0 < (c[7658] | 0) >>> 0) xa();
						else {
							c[j >> 2] = r;
							c[r + 24 >> 2] = f;
							c[r + 12 >> 2] = r;
							c[r + 8 >> 2] = r;
							break g
						}
					} else h = f;
					while (0);
					f = h + 8 | 0;
					e = c[f >> 2] | 0;
					d = c[7658] | 0;
					if (h >>> 0 < d >>> 0) xa();
					if (e >>> 0 < d >>> 0) xa();
					else {
						c[e + 12 >> 2] = r;
						c[f >> 2] = r;
						c[r + 8 >> 2] = e;
						c[r + 12 >> 2] = h;
						c[r + 24 >> 2] = 0;
						break
					}
				}
			} else {
				H = c[7658] | 0;
				if ((H | 0) == 0 | p >>> 0 < H >>> 0) c[7658] = p;
				c[7766] = p;
				c[7767] = q;
				c[7769] = 0;
				c[7663] = c[7772];
				c[7662] = -1;
				d = 0;
				do {
					H = d << 1;
					G = 30656 + (H << 2) | 0;
					c[30656 + (H + 3 << 2) >> 2] = G;
					c[30656 + (H + 2 << 2) >> 2] = G;
					d = d + 1 | 0
				} while ((d | 0) != 32);
				d = p + 8 | 0;
				if (!(d & 7)) d = 0;
				else d = 0 - d & 7;
				H = q + -40 - d | 0;
				c[7660] = p + d;
				c[7657] = H;
				c[p + (d + 4) >> 2] = H | 1;
				c[p + (q + -36) >> 2] = 40;
				c[7661] = c[7776]
			}
			while (0);
			d = c[7657] | 0;
			if (d >>> 0 > a >>> 0) {
				G = d - a | 0;
				c[7657] = G;
				H = c[7660] | 0;
				c[7660] = H + a;
				c[H + (a + 4) >> 2] = G | 1;
				c[H + 4 >> 2] = a | 3;
				H = H + 8 | 0;
				i = b;
				return H | 0
			}
		}
		c[(wa() | 0) >> 2] = 12;
		H = 0;
		i = b;
		return H | 0
	}
	function rj(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		b = i;
		if (!a) {
			i = b;
			return
		}
		q = a + -8 | 0;
		r = c[7658] | 0;
		if (q >>> 0 < r >>> 0) xa();
		o = c[a + -4 >> 2] | 0;
		n = o & 3;
		if ((n | 0) == 1) xa();
		j = o & -8;
		h = a + (j + -8) | 0;
		do
		if (!(o & 1)) {
			u = c[q >> 2] | 0;
			if (!n) {
				i = b;
				return
			}
			q = -8 - u | 0;
			o = a + q | 0;
			n = u + j | 0;
			if (o >>> 0 < r >>> 0) xa();
			if ((o | 0) == (c[7659] | 0)) {
				d = a + (j + -4) | 0;
				if ((c[d >> 2] & 3 | 0) != 3) {
					d = o;
					m = n;
					break
				}
				c[7656] = n;
				c[d >> 2] = c[d >> 2] & -2;
				c[a + (q + 4) >> 2] = n | 1;
				c[h >> 2] = n;
				i = b;
				return
			}
			t = u >>> 3;
			if (u >>> 0 < 256) {
				d = c[a + (q + 8) >> 2] | 0;
				m = c[a + (q + 12) >> 2] | 0;
				p = 30656 + (t << 1 << 2) | 0;
				if ((d | 0) != (p | 0)) {
					if (d >>> 0 < r >>> 0) xa();
					if ((c[d + 12 >> 2] | 0) != (o | 0)) xa()
				}
				if ((m | 0) == (d | 0)) {
					c[7654] = c[7654] & ~ (1 << t);
					d = o;
					m = n;
					break
				}
				if ((m | 0) != (p | 0)) {
					if (m >>> 0 < r >>> 0) xa();
					p = m + 8 | 0;
					if ((c[p >> 2] | 0) == (o | 0)) s = p;
					else xa()
				} else s = m + 8 | 0;
				c[d + 12 >> 2] = m;
				c[s >> 2] = d;
				d = o;
				m = n;
				break
			}
			s = c[a + (q + 24) >> 2] | 0;
			t = c[a + (q + 12) >> 2] | 0;
			do
			if ((t | 0) == (o | 0)) {
				u = a + (q + 20) | 0;
				t = c[u >> 2] | 0;
				if (!t) {
					u = a + (q + 16) | 0;
					t = c[u >> 2] | 0;
					if (!t) {
						p = 0;
						break
					}
				}
				while (1) {
					w = t + 20 | 0;
					v = c[w >> 2] | 0;
					if (v) {
						t = v;
						u = w;
						continue
					}
					v = t + 16 | 0;
					w = c[v >> 2] | 0;
					if (!w) break;
					else {
						t = w;
						u = v
					}
				}
				if (u >>> 0 < r >>> 0) xa();
				else {
					c[u >> 2] = 0;
					p = t;
					break
				}
			} else {
				u = c[a + (q + 8) >> 2] | 0;
				if (u >>> 0 < r >>> 0) xa();
				r = u + 12 | 0;
				if ((c[r >> 2] | 0) != (o | 0)) xa();
				v = t + 8 | 0;
				if ((c[v >> 2] | 0) == (o | 0)) {
					c[r >> 2] = t;
					c[v >> 2] = u;
					p = t;
					break
				} else xa()
			}
			while (0);
			if (s) {
				t = c[a + (q + 28) >> 2] | 0;
				r = 30920 + (t << 2) | 0;
				if ((o | 0) == (c[r >> 2] | 0)) {
					c[r >> 2] = p;
					if (!p) {
						c[7655] = c[7655] & ~ (1 << t);
						d = o;
						m = n;
						break
					}
				} else {
					if (s >>> 0 < (c[7658] | 0) >>> 0) xa();
					r = s + 16 | 0;
					if ((c[r >> 2] | 0) == (o | 0)) c[r >> 2] = p;
					else c[s + 20 >> 2] = p;
					if (!p) {
						d = o;
						m = n;
						break
					}
				}
				if (p >>> 0 < (c[7658] | 0) >>> 0) xa();
				c[p + 24 >> 2] = s;
				r = c[a + (q + 16) >> 2] | 0;
				do
				if (r) if (r >>> 0 < (c[7658] | 0) >>> 0) xa();
				else {
					c[p + 16 >> 2] = r;
					c[r + 24 >> 2] = p;
					break
				}
				while (0);
				q = c[a + (q + 20) >> 2] | 0;
				if (q) if (q >>> 0 < (c[7658] | 0) >>> 0) xa();
				else {
					c[p + 20 >> 2] = q;
					c[q + 24 >> 2] = p;
					d = o;
					m = n;
					break
				} else {
					d = o;
					m = n
				}
			} else {
				d = o;
				m = n
			}
		} else {
			d = q;
			m = j
		}
		while (0);
		if (d >>> 0 >= h >>> 0) xa();
		n = a + (j + -4) | 0;
		o = c[n >> 2] | 0;
		if (!(o & 1)) xa();
		if (!(o & 2)) {
			if ((h | 0) == (c[7660] | 0)) {
				w = (c[7657] | 0) + m | 0;
				c[7657] = w;
				c[7660] = d;
				c[d + 4 >> 2] = w | 1;
				if ((d | 0) != (c[7659] | 0)) {
					i = b;
					return
				}
				c[7659] = 0;
				c[7656] = 0;
				i = b;
				return
			}
			if ((h | 0) == (c[7659] | 0)) {
				w = (c[7656] | 0) + m | 0;
				c[7656] = w;
				c[7659] = d;
				c[d + 4 >> 2] = w | 1;
				c[d + w >> 2] = w;
				i = b;
				return
			}
			m = (o & -8) + m | 0;
			n = o >>> 3;
			do
			if (o >>> 0 >= 256) {
				l = c[a + (j + 16) >> 2] | 0;
				q = c[a + (j | 4) >> 2] | 0;
				do
				if ((q | 0) == (h | 0)) {
					o = a + (j + 12) | 0;
					n = c[o >> 2] | 0;
					if (!n) {
						o = a + (j + 8) | 0;
						n = c[o >> 2] | 0;
						if (!n) {
							k = 0;
							break
						}
					}
					while (1) {
						p = n + 20 | 0;
						q = c[p >> 2] | 0;
						if (q) {
							n = q;
							o = p;
							continue
						}
						p = n + 16 | 0;
						q = c[p >> 2] | 0;
						if (!q) break;
						else {
							n = q;
							o = p
						}
					}
					if (o >>> 0 < (c[7658] | 0) >>> 0) xa();
					else {
						c[o >> 2] = 0;
						k = n;
						break
					}
				} else {
					o = c[a + j >> 2] | 0;
					if (o >>> 0 < (c[7658] | 0) >>> 0) xa();
					p = o + 12 | 0;
					if ((c[p >> 2] | 0) != (h | 0)) xa();
					n = q + 8 | 0;
					if ((c[n >> 2] | 0) == (h | 0)) {
						c[p >> 2] = q;
						c[n >> 2] = o;
						k = q;
						break
					} else xa()
				}
				while (0);
				if (l) {
					n = c[a + (j + 20) >> 2] | 0;
					o = 30920 + (n << 2) | 0;
					if ((h | 0) == (c[o >> 2] | 0)) {
						c[o >> 2] = k;
						if (!k) {
							c[7655] = c[7655] & ~ (1 << n);
							break
						}
					} else {
						if (l >>> 0 < (c[7658] | 0) >>> 0) xa();
						n = l + 16 | 0;
						if ((c[n >> 2] | 0) == (h | 0)) c[n >> 2] = k;
						else c[l + 20 >> 2] = k;
						if (!k) break
					}
					if (k >>> 0 < (c[7658] | 0) >>> 0) xa();
					c[k + 24 >> 2] = l;
					h = c[a + (j + 8) >> 2] | 0;
					do
					if (h) if (h >>> 0 < (c[7658] | 0) >>> 0) xa();
					else {
						c[k + 16 >> 2] = h;
						c[h + 24 >> 2] = k;
						break
					}
					while (0);
					h = c[a + (j + 12) >> 2] | 0;
					if (h) if (h >>> 0 < (c[7658] | 0) >>> 0) xa();
					else {
						c[k + 20 >> 2] = h;
						c[h + 24 >> 2] = k;
						break
					}
				}
			} else {
				k = c[a + j >> 2] | 0;
				a = c[a + (j | 4) >> 2] | 0;
				j = 30656 + (n << 1 << 2) | 0;
				if ((k | 0) != (j | 0)) {
					if (k >>> 0 < (c[7658] | 0) >>> 0) xa();
					if ((c[k + 12 >> 2] | 0) != (h | 0)) xa()
				}
				if ((a | 0) == (k | 0)) {
					c[7654] = c[7654] & ~ (1 << n);
					break
				}
				if ((a | 0) != (j | 0)) {
					if (a >>> 0 < (c[7658] | 0) >>> 0) xa();
					j = a + 8 | 0;
					if ((c[j >> 2] | 0) == (h | 0)) l = j;
					else xa()
				} else l = a + 8 | 0;
				c[k + 12 >> 2] = a;
				c[l >> 2] = k
			}
			while (0);
			c[d + 4 >> 2] = m | 1;
			c[d + m >> 2] = m;
			if ((d | 0) == (c[7659] | 0)) {
				c[7656] = m;
				i = b;
				return
			}
		} else {
			c[n >> 2] = o & -2;
			c[d + 4 >> 2] = m | 1;
			c[d + m >> 2] = m
		}
		h = m >>> 3;
		if (m >>> 0 < 256) {
			a = h << 1;
			e = 30656 + (a << 2) | 0;
			j = c[7654] | 0;
			h = 1 << h;
			if (j & h) {
				h = 30656 + (a + 2 << 2) | 0;
				a = c[h >> 2] | 0;
				if (a >>> 0 < (c[7658] | 0) >>> 0) xa();
				else {
					f = h;
					g = a
				}
			} else {
				c[7654] = j | h;
				f = 30656 + (a + 2 << 2) | 0;
				g = e
			}
			c[f >> 2] = d;
			c[g + 12 >> 2] = d;
			c[d + 8 >> 2] = g;
			c[d + 12 >> 2] = e;
			i = b;
			return
		}
		f = m >>> 8;
		if (f) if (m >>> 0 > 16777215) f = 31;
		else {
			v = (f + 1048320 | 0) >>> 16 & 8;
			w = f << v;
			u = (w + 520192 | 0) >>> 16 & 4;
			w = w << u;
			f = (w + 245760 | 0) >>> 16 & 2;
			f = 14 - (u | v | f) + (w << f >>> 15) | 0;
			f = m >>> (f + 7 | 0) & 1 | f << 1
		} else f = 0;
		g = 30920 + (f << 2) | 0;
		c[d + 28 >> 2] = f;
		c[d + 20 >> 2] = 0;
		c[d + 16 >> 2] = 0;
		a = c[7655] | 0;
		h = 1 << f;
		a: do
		if (a & h) {
			g = c[g >> 2] | 0;
			if ((f | 0) == 31) f = 0;
			else f = 25 - (f >>> 1) | 0;
			b: do
			if ((c[g + 4 >> 2] & -8 | 0) != (m | 0)) {
				f = m << f;
				a = g;
				while (1) {
					h = a + (f >>> 31 << 2) + 16 | 0;
					g = c[h >> 2] | 0;
					if (!g) break;
					if ((c[g + 4 >> 2] & -8 | 0) == (m | 0)) {
						e = g;
						break b
					} else {
						f = f << 1;
						a = g
					}
				}
				if (h >>> 0 < (c[7658] | 0) >>> 0) xa();
				else {
					c[h >> 2] = d;
					c[d + 24 >> 2] = a;
					c[d + 12 >> 2] = d;
					c[d + 8 >> 2] = d;
					break a
				}
			} else e = g;
			while (0);
			g = e + 8 | 0;
			f = c[g >> 2] | 0;
			h = c[7658] | 0;
			if (e >>> 0 < h >>> 0) xa();
			if (f >>> 0 < h >>> 0) xa();
			else {
				c[f + 12 >> 2] = d;
				c[g >> 2] = d;
				c[d + 8 >> 2] = f;
				c[d + 12 >> 2] = e;
				c[d + 24 >> 2] = 0;
				break
			}
		} else {
			c[7655] = a | h;
			c[g >> 2] = d;
			c[d + 24 >> 2] = g;
			c[d + 12 >> 2] = d;
			c[d + 8 >> 2] = d
		}
		while (0);
		w = (c[7662] | 0) + -1 | 0;
		c[7662] = w;
		if (!w) d = 31072 | 0;
		else {
			i = b;
			return
		}
		while (1) {
			d = c[d >> 2] | 0;
			if (!d) break;
			else d = d + 8 | 0
		}
		c[7662] = -1;
		i = b;
		return
	}
	function sj() {}
	function tj(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			D = b >> c;
			return a >>> c | (b & (1 << c) - 1) << 32 - c
		}
		D = (b | 0) < 0 ? -1 : 0;
		return b >> c - 32 | 0
	}
	function uj(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			D = b >>> c;
			return a >>> c | (b & (1 << c) - 1) << 32 - c
		}
		D = 0;
		return b >>> c - 32 | 0
	}
	function vj(b) {
		b = b | 0;
		var c = 0;
		c = a[n + (b >>> 24) >> 0] | 0;
		if ((c | 0) < 8) return c | 0;
		c = a[n + (b >> 16 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 8 | 0;
		c = a[n + (b >> 8 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 16 | 0;
		return (a[n + (b & 255) >> 0] | 0) + 24 | 0
	}
	function wj(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0;
		f = b + e | 0;
		if ((e | 0) >= 20) {
			d = d & 255;
			i = b & 3;
			h = d | d << 8 | d << 16 | d << 24;
			g = f & ~3;
			if (i) {
				i = b + 4 - i | 0;
				while ((b | 0) < (i | 0)) {
					a[b >> 0] = d;
					b = b + 1 | 0
				}
			}
			while ((b | 0) < (g | 0)) {
				c[b >> 2] = h;
				b = b + 4 | 0
			}
		}
		while ((b | 0) < (f | 0)) {
			a[b >> 0] = d;
			b = b + 1 | 0
		}
		return b - e | 0
	}
	function xj(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		c = a + c >>> 0;
		return (D = b + d + (c >>> 0 < a >>> 0 | 0) >>> 0, c | 0) | 0
	}
	function yj(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		if ((e | 0) >= 4096) return oa(b | 0, d | 0, e | 0) | 0;
		f = b | 0;
		if ((b & 3) == (d & 3)) {
			while (b & 3) {
				if (!e) return f | 0;
				a[b >> 0] = a[d >> 0] | 0;
				b = b + 1 | 0;
				d = d + 1 | 0;
				e = e - 1 | 0
			}
			while ((e | 0) >= 4) {
				c[b >> 2] = c[d >> 2];
				b = b + 4 | 0;
				d = d + 4 | 0;
				e = e - 4 | 0
			}
		}
		while ((e | 0) > 0) {
			a[b >> 0] = a[d >> 0] | 0;
			b = b + 1 | 0;
			d = d + 1 | 0;
			e = e - 1 | 0
		}
		return f | 0
	}
	function zj(b, c, d) {
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0;
		if ((c | 0) < (b | 0) & (b | 0) < (c + d | 0)) {
			e = b;
			c = c + d | 0;
			b = b + d | 0;
			while ((d | 0) > 0) {
				b = b - 1 | 0;
				c = c - 1 | 0;
				d = d - 1 | 0;
				a[b >> 0] = a[c >> 0] | 0
			}
			b = e
		} else yj(b, c, d) | 0;
		return b | 0
	}
	function Aj(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		b = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
		return (D = b, a - c >>> 0 | 0) | 0
	}
	function Bj(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			D = b << c | (a & (1 << c) - 1 << 32 - c) >>> 32 - c;
			return a << c
		}
		D = a << c - 32;
		return 0
	}
	function Cj(b) {
		b = b | 0;
		var c = 0;
		c = a[m + (b & 255) >> 0] | 0;
		if ((c | 0) < 8) return c | 0;
		c = a[m + (b >> 8 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 8 | 0;
		c = a[m + (b >> 16 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 16 | 0;
		return (a[m + (b >>> 24) >> 0] | 0) + 24 | 0
	}
	function Dj(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0;
		f = a & 65535;
		d = b & 65535;
		c = $(d, f) | 0;
		e = a >>> 16;
		d = (c >>> 16) + ($(d, e) | 0) | 0;
		b = b >>> 16;
		a = $(b, f) | 0;
		return (D = (d >>> 16) + ($(b, e) | 0) + (((d & 65535) + a | 0) >>> 16) | 0, d + a << 16 | c & 65535 | 0) | 0
	}
	function Ej(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0;
		j = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		i = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		f = d >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
		e = ((d | 0) < 0 ? -1 : 0) >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
		h = Aj(j ^ a, i ^ b, j, i) | 0;
		g = D;
		b = f ^ j;
		a = e ^ i;
		a = Aj((Jj(h, g, Aj(f ^ c, e ^ d, f, e) | 0, D, 0) | 0) ^ b, D ^ a, b, a) | 0;
		return a | 0
	}
	function Fj(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		f = i;
		i = i + 8 | 0;
		j = f | 0;
		h = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		g = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		l = e >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
		k = ((e | 0) < 0 ? -1 : 0) >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
		b = Aj(h ^ a, g ^ b, h, g) | 0;
		a = D;
		Jj(b, a, Aj(l ^ d, k ^ e, l, k) | 0, D, j) | 0;
		a = Aj(c[j >> 2] ^ h, c[j + 4 >> 2] ^ g, h, g) | 0;
		b = D;
		i = f;
		return (D = b, a) | 0
	}
	function Gj(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = a;
		f = c;
		a = Dj(e, f) | 0;
		c = D;
		return (D = ($(b, f) | 0) + ($(d, e) | 0) + c | c & 0, a | 0 | 0) | 0
	}
	function Hj(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		a = Jj(a, b, c, d, 0) | 0;
		return a | 0
	}
	function Ij(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0;
		g = i;
		i = i + 8 | 0;
		f = g | 0;
		Jj(a, b, d, e, f) | 0;
		i = g;
		return (D = c[f + 4 >> 2] | 0, c[f >> 2] | 0) | 0
	}
	function Jj(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		h = a;
		j = b;
		i = j;
		l = d;
		g = e;
		k = g;
		if (!i) {
			g = (f | 0) != 0;
			if (!k) {
				if (g) {
					c[f >> 2] = (h >>> 0) % (l >>> 0);
					c[f + 4 >> 2] = 0
				}
				k = 0;
				m = (h >>> 0) / (l >>> 0) >>> 0;
				return (D = k, m) | 0
			} else {
				if (!g) {
					l = 0;
					m = 0;
					return (D = l, m) | 0
				}
				c[f >> 2] = a | 0;
				c[f + 4 >> 2] = b & 0;
				l = 0;
				m = 0;
				return (D = l, m) | 0
			}
		}
		m = (k | 0) == 0;
		do
		if (l) {
			if (!m) {
				k = (vj(k | 0) | 0) - (vj(i | 0) | 0) | 0;
				if (k >>> 0 <= 31) {
					m = k + 1 | 0;
					l = 31 - k | 0;
					a = k - 31 >> 31;
					j = m;
					b = h >>> (m >>> 0) & a | i << l;
					a = i >>> (m >>> 0) & a;
					k = 0;
					l = h << l;
					break
				}
				if (!f) {
					l = 0;
					m = 0;
					return (D = l, m) | 0
				}
				c[f >> 2] = a | 0;
				c[f + 4 >> 2] = j | b & 0;
				l = 0;
				m = 0;
				return (D = l, m) | 0
			}
			k = l - 1 | 0;
			if (k & l) {
				l = (vj(l | 0) | 0) + 33 - (vj(i | 0) | 0) | 0;
				p = 64 - l | 0;
				m = 32 - l | 0;
				n = m >> 31;
				o = l - 32 | 0;
				a = o >> 31;
				j = l;
				b = m - 1 >> 31 & i >>> (o >>> 0) | (i << m | h >>> (l >>> 0)) & a;
				a = a & i >>> (l >>> 0);
				k = h << p & n;
				l = (i << p | h >>> (o >>> 0)) & n | h << m & l - 33 >> 31;
				break
			}
			if (f) {
				c[f >> 2] = k & h;
				c[f + 4 >> 2] = 0
			}
			if ((l | 0) == 1) {
				o = j | b & 0;
				p = a | 0 | 0;
				return (D = o, p) | 0
			} else {
				p = Cj(l | 0) | 0;
				o = i >>> (p >>> 0) | 0;
				p = i << 32 - p | h >>> (p >>> 0) | 0;
				return (D = o, p) | 0
			}
		} else {
			if (m) {
				if (f) {
					c[f >> 2] = (i >>> 0) % (l >>> 0);
					c[f + 4 >> 2] = 0
				}
				o = 0;
				p = (i >>> 0) / (l >>> 0) >>> 0;
				return (D = o, p) | 0
			}
			if (!h) {
				if (f) {
					c[f >> 2] = 0;
					c[f + 4 >> 2] = (i >>> 0) % (k >>> 0)
				}
				o = 0;
				p = (i >>> 0) / (k >>> 0) >>> 0;
				return (D = o, p) | 0
			}
			l = k - 1 | 0;
			if (!(l & k)) {
				if (f) {
					c[f >> 2] = a | 0;
					c[f + 4 >> 2] = l & i | b & 0
				}
				o = 0;
				p = i >>> ((Cj(k | 0) | 0) >>> 0);
				return (D = o, p) | 0
			}
			k = (vj(k | 0) | 0) - (vj(i | 0) | 0) | 0;
			if (k >>> 0 <= 30) {
				a = k + 1 | 0;
				l = 31 - k | 0;
				j = a;
				b = i << l | h >>> (a >>> 0);
				a = i >>> (a >>> 0);
				k = 0;
				l = h << l;
				break
			}
			if (!f) {
				o = 0;
				p = 0;
				return (D = o, p) | 0
			}
			c[f >> 2] = a | 0;
			c[f + 4 >> 2] = j | b & 0;
			o = 0;
			p = 0;
			return (D = o, p) | 0
		}
		while (0);
		if (!j) {
			g = l;
			e = 0;
			i = 0
		} else {
			h = d | 0 | 0;
			g = g | e & 0;
			e = xj(h, g, -1, -1) | 0;
			d = D;
			i = 0;
			do {
				m = l;
				l = k >>> 31 | l << 1;
				k = i | k << 1;
				m = b << 1 | m >>> 31 | 0;
				n = b >>> 31 | a << 1 | 0;
				Aj(e, d, m, n) | 0;
				p = D;
				o = p >> 31 | ((p | 0) < 0 ? -1 : 0) << 1;
				i = o & 1;
				b = Aj(m, n, o & h, (((p | 0) < 0 ? -1 : 0) >> 31 | ((p | 0) < 0 ? -1 : 0) << 1) & g) | 0;
				a = D;
				j = j - 1 | 0
			} while ((j | 0) != 0);
			g = l;
			e = 0
		}
		h = 0;
		if (f) {
			c[f >> 2] = b;
			c[f + 4 >> 2] = a
		}
		o = (k | 0) >>> 31 | (g | h) << 1 | (h << 1 | k >>> 31) & 0 | e;
		p = (k << 1 | 0 >>> 31) & -2 | i;
		return (D = o, p) | 0
	}
	function Kj(a, b, c, d, e, f, g, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		Ca[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0)
	}
	function Lj(a, b, c, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		aa(0)
	}




	// EMSCRIPTEN_END_FUNCS
	var Ca = [Lj, Ri, Qi, Lj];
	return {
		_opus_get_version_string: qb,
		_free: rj,
		_opus_encode_float: fj,
		_opus_decoder_create: si,
		_i64Add: xj,
		_memmove: zj,
		_opus_decode_float: Di,
		_bitshift64Ashr: tj,
		_opus_encoder_destroy: hj,
		_memset: wj,
		_malloc: qj,
		_opus_decoder_destroy: Fi,
		_opus_encoder_create: Ni,
		_opus_encode: ej,
		_llvm_ctlz_i32: vj,
		_bitshift64Lshr: uj,
		_opus_decode: Ai,
		_opus_decoder_ctl: Ei,
		_memcpy: yj,
		_opus_encoder_ctl: gj,
		runPostSets: sj,
		stackAlloc: Da,
		stackSave: Ea,
		stackRestore: Fa,
		setThrew: Ga,
		setTempRet0: Ja,
		getTempRet0: Ka,
		dynCall_viiiiiii: Kj
	}
})


// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var _opus_get_version_string = Module["_opus_get_version_string"] = asm["_opus_get_version_string"];
var _free = Module["_free"] = asm["_free"];
var _opus_encode_float = Module["_opus_encode_float"] = asm["_opus_encode_float"];
var _opus_decoder_create = Module["_opus_decoder_create"] = asm["_opus_decoder_create"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _opus_decode_float = Module["_opus_decode_float"] = asm["_opus_decode_float"];
var _bitshift64Ashr = Module["_bitshift64Ashr"] = asm["_bitshift64Ashr"];
var _opus_encoder_destroy = Module["_opus_encoder_destroy"] = asm["_opus_encoder_destroy"];
var _memset = Module["_memset"] = asm["_memset"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _opus_decoder_destroy = Module["_opus_decoder_destroy"] = asm["_opus_decoder_destroy"];
var _opus_encoder_create = Module["_opus_encoder_create"] = asm["_opus_encoder_create"];
var _opus_encode = Module["_opus_encode"] = asm["_opus_encode"];
var _llvm_ctlz_i32 = Module["_llvm_ctlz_i32"] = asm["_llvm_ctlz_i32"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _opus_decode = Module["_opus_decode"] = asm["_opus_decode"];
var _opus_decoder_ctl = Module["_opus_decoder_ctl"] = asm["_opus_decoder_ctl"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _opus_encoder_ctl = Module["_opus_encoder_ctl"] = asm["_opus_encoder_ctl"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
Runtime.stackAlloc = asm["stackAlloc"];
Runtime.stackSave = asm["stackSave"];
Runtime.stackRestore = asm["stackRestore"];
Runtime.setTempRet0 = asm["setTempRet0"];
Runtime.getTempRet0 = asm["getTempRet0"];
var i64Math = (function() {
	var goog = {
		math: {}
	};
	goog.math.Long = (function(low, high) {
		this.low_ = low | 0;
		this.high_ = high | 0
	});
	goog.math.Long.IntCache_ = {};
	goog.math.Long.fromInt = (function(value) {
		if (-128 <= value && value < 128) {
			var cachedObj = goog.math.Long.IntCache_[value];
			if (cachedObj) {
				return cachedObj
			}
		}
		var obj = new goog.math.Long(value | 0, value < 0 ? -1 : 0);
		if (-128 <= value && value < 128) {
			goog.math.Long.IntCache_[value] = obj
		}
		return obj
	});
	goog.math.Long.fromNumber = (function(value) {
		if (isNaN(value) || !isFinite(value)) {
			return goog.math.Long.ZERO
		} else if (value <= -goog.math.Long.TWO_PWR_63_DBL_) {
			return goog.math.Long.MIN_VALUE
		} else if (value + 1 >= goog.math.Long.TWO_PWR_63_DBL_) {
			return goog.math.Long.MAX_VALUE
		} else if (value < 0) {
			return goog.math.Long.fromNumber(-value).negate()
		} else {
			return new goog.math.Long(value % goog.math.Long.TWO_PWR_32_DBL_ | 0, value / goog.math.Long.TWO_PWR_32_DBL_ | 0)
		}
	});
	goog.math.Long.fromBits = (function(lowBits, highBits) {
		return new goog.math.Long(lowBits, highBits)
	});
	goog.math.Long.fromString = (function(str, opt_radix) {
		if (str.length == 0) {
			throw Error("number format error: empty string")
		}
		var radix = opt_radix || 10;
		if (radix < 2 || 36 < radix) {
			throw Error("radix out of range: " + radix)
		}
		if (str.charAt(0) == "-") {
			return goog.math.Long.fromString(str.substring(1), radix).negate()
		} else if (str.indexOf("-") >= 0) {
			throw Error('number format error: interior "-" character: ' + str)
		}
		var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 8));
		var result = goog.math.Long.ZERO;
		for (var i = 0; i < str.length; i += 8) {
			var size = Math.min(8, str.length - i);
			var value = parseInt(str.substring(i, i + size), radix);
			if (size < 8) {
				var power = goog.math.Long.fromNumber(Math.pow(radix, size));
				result = result.multiply(power).add(goog.math.Long.fromNumber(value))
			} else {
				result = result.multiply(radixToPower);
				result = result.add(goog.math.Long.fromNumber(value))
			}
		}
		return result
	});
	goog.math.Long.TWO_PWR_16_DBL_ = 1 << 16;
	goog.math.Long.TWO_PWR_24_DBL_ = 1 << 24;
	goog.math.Long.TWO_PWR_32_DBL_ = goog.math.Long.TWO_PWR_16_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
	goog.math.Long.TWO_PWR_31_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ / 2;
	goog.math.Long.TWO_PWR_48_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
	goog.math.Long.TWO_PWR_64_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_32_DBL_;
	goog.math.Long.TWO_PWR_63_DBL_ = goog.math.Long.TWO_PWR_64_DBL_ / 2;
	goog.math.Long.ZERO = goog.math.Long.fromInt(0);
	goog.math.Long.ONE = goog.math.Long.fromInt(1);
	goog.math.Long.NEG_ONE = goog.math.Long.fromInt(-1);
	goog.math.Long.MAX_VALUE = goog.math.Long.fromBits(4294967295 | 0, 2147483647 | 0);
	goog.math.Long.MIN_VALUE = goog.math.Long.fromBits(0, 2147483648 | 0);
	goog.math.Long.TWO_PWR_24_ = goog.math.Long.fromInt(1 << 24);
	goog.math.Long.prototype.toInt = (function() {
		return this.low_
	});
	goog.math.Long.prototype.toNumber = (function() {
		return this.high_ * goog.math.Long.TWO_PWR_32_DBL_ + this.getLowBitsUnsigned()
	});
	goog.math.Long.prototype.toString = (function(opt_radix) {
		var radix = opt_radix || 10;
		if (radix < 2 || 36 < radix) {
			throw Error("radix out of range: " + radix)
		}
		if (this.isZero()) {
			return "0"
		}
		if (this.isNegative()) {
			if (this.equals(goog.math.Long.MIN_VALUE)) {
				var radixLong = goog.math.Long.fromNumber(radix);
				var div = this.div(radixLong);
				var rem = div.multiply(radixLong).subtract(this);
				return div.toString(radix) + rem.toInt().toString(radix)
			} else {
				return "-" + this.negate().toString(radix)
			}
		}
		var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 6));
		var rem = this;
		var result = "";
		while (true) {
			var remDiv = rem.div(radixToPower);
			var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
			var digits = intval.toString(radix);
			rem = remDiv;
			if (rem.isZero()) {
				return digits + result
			} else {
				while (digits.length < 6) {
					digits = "0" + digits
				}
				result = "" + digits + result
			}
		}
	});
	goog.math.Long.prototype.getHighBits = (function() {
		return this.high_
	});
	goog.math.Long.prototype.getLowBits = (function() {
		return this.low_
	});
	goog.math.Long.prototype.getLowBitsUnsigned = (function() {
		return this.low_ >= 0 ? this.low_ : goog.math.Long.TWO_PWR_32_DBL_ + this.low_
	});
	goog.math.Long.prototype.getNumBitsAbs = (function() {
		if (this.isNegative()) {
			if (this.equals(goog.math.Long.MIN_VALUE)) {
				return 64
			} else {
				return this.negate().getNumBitsAbs()
			}
		} else {
			var val = this.high_ != 0 ? this.high_ : this.low_;
			for (var bit = 31; bit > 0; bit--) {
				if ((val & 1 << bit) != 0) {
					break
				}
			}
			return this.high_ != 0 ? bit + 33 : bit + 1
		}
	});
	goog.math.Long.prototype.isZero = (function() {
		return this.high_ == 0 && this.low_ == 0
	});
	goog.math.Long.prototype.isNegative = (function() {
		return this.high_ < 0
	});
	goog.math.Long.prototype.isOdd = (function() {
		return (this.low_ & 1) == 1
	});
	goog.math.Long.prototype.equals = (function(other) {
		return this.high_ == other.high_ && this.low_ == other.low_
	});
	goog.math.Long.prototype.notEquals = (function(other) {
		return this.high_ != other.high_ || this.low_ != other.low_
	});
	goog.math.Long.prototype.lessThan = (function(other) {
		return this.compare(other) < 0
	});
	goog.math.Long.prototype.lessThanOrEqual = (function(other) {
		return this.compare(other) <= 0
	});
	goog.math.Long.prototype.greaterThan = (function(other) {
		return this.compare(other) > 0
	});
	goog.math.Long.prototype.greaterThanOrEqual = (function(other) {
		return this.compare(other) >= 0
	});
	goog.math.Long.prototype.compare = (function(other) {
		if (this.equals(other)) {
			return 0
		}
		var thisNeg = this.isNegative();
		var otherNeg = other.isNegative();
		if (thisNeg && !otherNeg) {
			return -1
		}
		if (!thisNeg && otherNeg) {
			return 1
		}
		if (this.subtract(other).isNegative()) {
			return -1
		} else {
			return 1
		}
	});
	goog.math.Long.prototype.negate = (function() {
		if (this.equals(goog.math.Long.MIN_VALUE)) {
			return goog.math.Long.MIN_VALUE
		} else {
			return this.not().add(goog.math.Long.ONE)
		}
	});
	goog.math.Long.prototype.add = (function(other) {
		var a48 = this.high_ >>> 16;
		var a32 = this.high_ & 65535;
		var a16 = this.low_ >>> 16;
		var a00 = this.low_ & 65535;
		var b48 = other.high_ >>> 16;
		var b32 = other.high_ & 65535;
		var b16 = other.low_ >>> 16;
		var b00 = other.low_ & 65535;
		var c48 = 0,
			c32 = 0,
			c16 = 0,
			c00 = 0;
		c00 += a00 + b00;
		c16 += c00 >>> 16;
		c00 &= 65535;
		c16 += a16 + b16;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c32 += a32 + b32;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c48 += a48 + b48;
		c48 &= 65535;
		return goog.math.Long.fromBits(c16 << 16 | c00, c48 << 16 | c32)
	});
	goog.math.Long.prototype.subtract = (function(other) {
		return this.add(other.negate())
	});
	goog.math.Long.prototype.multiply = (function(other) {
		if (this.isZero()) {
			return goog.math.Long.ZERO
		} else if (other.isZero()) {
			return goog.math.Long.ZERO
		}
		if (this.equals(goog.math.Long.MIN_VALUE)) {
			return other.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO
		} else if (other.equals(goog.math.Long.MIN_VALUE)) {
			return this.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO
		}
		if (this.isNegative()) {
			if (other.isNegative()) {
				return this.negate().multiply(other.negate())
			} else {
				return this.negate().multiply(other).negate()
			}
		} else if (other.isNegative()) {
			return this.multiply(other.negate()).negate()
		}
		if (this.lessThan(goog.math.Long.TWO_PWR_24_) && other.lessThan(goog.math.Long.TWO_PWR_24_)) {
			return goog.math.Long.fromNumber(this.toNumber() * other.toNumber())
		}
		var a48 = this.high_ >>> 16;
		var a32 = this.high_ & 65535;
		var a16 = this.low_ >>> 16;
		var a00 = this.low_ & 65535;
		var b48 = other.high_ >>> 16;
		var b32 = other.high_ & 65535;
		var b16 = other.low_ >>> 16;
		var b00 = other.low_ & 65535;
		var c48 = 0,
			c32 = 0,
			c16 = 0,
			c00 = 0;
		c00 += a00 * b00;
		c16 += c00 >>> 16;
		c00 &= 65535;
		c16 += a16 * b00;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c16 += a00 * b16;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c32 += a32 * b00;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c32 += a16 * b16;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c32 += a00 * b32;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
		c48 &= 65535;
		return goog.math.Long.fromBits(c16 << 16 | c00, c48 << 16 | c32)
	});
	goog.math.Long.prototype.div = (function(other) {
		if (other.isZero()) {
			throw Error("division by zero")
		} else if (this.isZero()) {
			return goog.math.Long.ZERO
		}
		if (this.equals(goog.math.Long.MIN_VALUE)) {
			if (other.equals(goog.math.Long.ONE) || other.equals(goog.math.Long.NEG_ONE)) {
				return goog.math.Long.MIN_VALUE
			} else if (other.equals(goog.math.Long.MIN_VALUE)) {
				return goog.math.Long.ONE
			} else {
				var halfThis = this.shiftRight(1);
				var approx = halfThis.div(other).shiftLeft(1);
				if (approx.equals(goog.math.Long.ZERO)) {
					return other.isNegative() ? goog.math.Long.ONE : goog.math.Long.NEG_ONE
				} else {
					var rem = this.subtract(other.multiply(approx));
					var result = approx.add(rem.div(other));
					return result
				}
			}
		} else if (other.equals(goog.math.Long.MIN_VALUE)) {
			return goog.math.Long.ZERO
		}
		if (this.isNegative()) {
			if (other.isNegative()) {
				return this.negate().div(other.negate())
			} else {
				return this.negate().div(other).negate()
			}
		} else if (other.isNegative()) {
			return this.div(other.negate()).negate()
		}
		var res = goog.math.Long.ZERO;
		var rem = this;
		while (rem.greaterThanOrEqual(other)) {
			var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));
			var log2 = Math.ceil(Math.log(approx) / Math.LN2);
			var delta = log2 <= 48 ? 1 : Math.pow(2, log2 - 48);
			var approxRes = goog.math.Long.fromNumber(approx);
			var approxRem = approxRes.multiply(other);
			while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
				approx -= delta;
				approxRes = goog.math.Long.fromNumber(approx);
				approxRem = approxRes.multiply(other)
			}
			if (approxRes.isZero()) {
				approxRes = goog.math.Long.ONE
			}
			res = res.add(approxRes);
			rem = rem.subtract(approxRem)
		}
		return res
	});
	goog.math.Long.prototype.modulo = (function(other) {
		return this.subtract(this.div(other).multiply(other))
	});
	goog.math.Long.prototype.not = (function() {
		return goog.math.Long.fromBits(~this.low_, ~this.high_)
	});
	goog.math.Long.prototype.and = (function(other) {
		return goog.math.Long.fromBits(this.low_ & other.low_, this.high_ & other.high_)
	});
	goog.math.Long.prototype.or = (function(other) {
		return goog.math.Long.fromBits(this.low_ | other.low_, this.high_ | other.high_)
	});
	goog.math.Long.prototype.xor = (function(other) {
		return goog.math.Long.fromBits(this.low_ ^ other.low_, this.high_ ^ other.high_)
	});
	goog.math.Long.prototype.shiftLeft = (function(numBits) {
		numBits &= 63;
		if (numBits == 0) {
			return this
		} else {
			var low = this.low_;
			if (numBits < 32) {
				var high = this.high_;
				return goog.math.Long.fromBits(low << numBits, high << numBits | low >>> 32 - numBits)
			} else {
				return goog.math.Long.fromBits(0, low << numBits - 32)
			}
		}
	});
	goog.math.Long.prototype.shiftRight = (function(numBits) {
		numBits &= 63;
		if (numBits == 0) {
			return this
		} else {
			var high = this.high_;
			if (numBits < 32) {
				var low = this.low_;
				return goog.math.Long.fromBits(low >>> numBits | high << 32 - numBits, high >> numBits)
			} else {
				return goog.math.Long.fromBits(high >> numBits - 32, high >= 0 ? 0 : -1)
			}
		}
	});
	goog.math.Long.prototype.shiftRightUnsigned = (function(numBits) {
		numBits &= 63;
		if (numBits == 0) {
			return this
		} else {
			var high = this.high_;
			if (numBits < 32) {
				var low = this.low_;
				return goog.math.Long.fromBits(low >>> numBits | high << 32 - numBits, high >>> numBits)
			} else if (numBits == 32) {
				return goog.math.Long.fromBits(high, 0)
			} else {
				return goog.math.Long.fromBits(high >>> numBits - 32, 0)
			}
		}
	});
	var navigator = {
		appName: "Modern Browser"
	};
	var dbits;
	var canary = 0xdeadbeefcafe;
	var j_lm = (canary & 16777215) == 15715070;

	function BigInteger(a, b, c) {
		if (a != null) if ("number" == typeof a) this.fromNumber(a, b, c);
		else if (b == null && "string" != typeof a) this.fromString(a, 256);
		else this.fromString(a, b)
	}
	function nbi() {
		return new BigInteger(null)
	}
	function am1(i, x, w, j, c, n) {
		while (--n >= 0) {
			var v = x * this[i++] + w[j] + c;
			c = Math.floor(v / 67108864);
			w[j++] = v & 67108863
		}
		return c
	}
	function am2(i, x, w, j, c, n) {
		var xl = x & 32767,
			xh = x >> 15;
		while (--n >= 0) {
			var l = this[i] & 32767;
			var h = this[i++] >> 15;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 32767) << 15) + w[j] + (c & 1073741823);
			c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
			w[j++] = l & 1073741823
		}
		return c
	}
	function am3(i, x, w, j, c, n) {
		var xl = x & 16383,
			xh = x >> 14;
		while (--n >= 0) {
			var l = this[i] & 16383;
			var h = this[i++] >> 14;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 16383) << 14) + w[j] + c;
			c = (l >> 28) + (m >> 14) + xh * h;
			w[j++] = l & 268435455
		}
		return c
	}
	if (j_lm && navigator.appName == "Microsoft Internet Explorer") {
		BigInteger.prototype.am = am2;
		dbits = 30
	} else if (j_lm && navigator.appName != "Netscape") {
		BigInteger.prototype.am = am1;
		dbits = 26
	} else {
		BigInteger.prototype.am = am3;
		dbits = 28
	}
	BigInteger.prototype.DB = dbits;
	BigInteger.prototype.DM = (1 << dbits) - 1;
	BigInteger.prototype.DV = 1 << dbits;
	var BI_FP = 52;
	BigInteger.prototype.FV = Math.pow(2, BI_FP);
	BigInteger.prototype.F1 = BI_FP - dbits;
	BigInteger.prototype.F2 = 2 * dbits - BI_FP;
	var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
	var BI_RC = new Array;
	var rr, vv;
	rr = "0".charCodeAt(0);
	for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
	rr = "a".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
	rr = "A".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

	function int2char(n) {
		return BI_RM.charAt(n)
	}
	function intAt(s, i) {
		var c = BI_RC[s.charCodeAt(i)];
		return c == null ? -1 : c
	}
	function bnpCopyTo(r) {
		for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
		r.t = this.t;
		r.s = this.s
	}
	function bnpFromInt(x) {
		this.t = 1;
		this.s = x < 0 ? -1 : 0;
		if (x > 0) this[0] = x;
		else if (x < -1) this[0] = x + DV;
		else this.t = 0
	}
	function nbv(i) {
		var r = nbi();
		r.fromInt(i);
		return r
	}
	function bnpFromString(s, b) {
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 256) k = 8;
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else {
			this.fromRadix(s, b);
			return
		}
		this.t = 0;
		this.s = 0;
		var i = s.length,
			mi = false,
			sh = 0;
		while (--i >= 0) {
			var x = k == 8 ? s[i] & 255 : intAt(s, i);
			if (x < 0) {
				if (s.charAt(i) == "-") mi = true;
				continue
			}
			mi = false;
			if (sh == 0) this[this.t++] = x;
			else if (sh + k > this.DB) {
				this[this.t - 1] |= (x & (1 << this.DB - sh) - 1) << sh;
				this[this.t++] = x >> this.DB - sh
			} else this[this.t - 1] |= x << sh;
			sh += k;
			if (sh >= this.DB) sh -= this.DB
		}
		if (k == 8 && (s[0] & 128) != 0) {
			this.s = -1;
			if (sh > 0) this[this.t - 1] |= (1 << this.DB - sh) - 1 << sh
		}
		this.clamp();
		if (mi) BigInteger.ZERO.subTo(this, this)
	}
	function bnpClamp() {
		var c = this.s & this.DM;
		while (this.t > 0 && this[this.t - 1] == c)--this.t
	}
	function bnToString(b) {
		if (this.s < 0) return "-" + this.negate().toString(b);
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else return this.toRadix(b);
		var km = (1 << k) - 1,
			d, m = false,
			r = "",
			i = this.t;
		var p = this.DB - i * this.DB % k;
		if (i-- > 0) {
			if (p < this.DB && (d = this[i] >> p) > 0) {
				m = true;
				r = int2char(d)
			}
			while (i >= 0) {
				if (p < k) {
					d = (this[i] & (1 << p) - 1) << k - p;
					d |= this[--i] >> (p += this.DB - k)
				} else {
					d = this[i] >> (p -= k) & km;
					if (p <= 0) {
						p += this.DB;
						--i
					}
				}
				if (d > 0) m = true;
				if (m) r += int2char(d)
			}
		}
		return m ? r : "0"
	}
	function bnNegate() {
		var r = nbi();
		BigInteger.ZERO.subTo(this, r);
		return r
	}
	function bnAbs() {
		return this.s < 0 ? this.negate() : this
	}
	function bnCompareTo(a) {
		var r = this.s - a.s;
		if (r != 0) return r;
		var i = this.t;
		r = i - a.t;
		if (r != 0) return this.s < 0 ? -r : r;
		while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
		return 0
	}
	function nbits(x) {
		var r = 1,
			t;
		if ((t = x >>> 16) != 0) {
			x = t;
			r += 16
		}
		if ((t = x >> 8) != 0) {
			x = t;
			r += 8
		}
		if ((t = x >> 4) != 0) {
			x = t;
			r += 4
		}
		if ((t = x >> 2) != 0) {
			x = t;
			r += 2
		}
		if ((t = x >> 1) != 0) {
			x = t;
			r += 1
		}
		return r
	}
	function bnBitLength() {
		if (this.t <= 0) return 0;
		return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ this.s & this.DM)
	}
	function bnpDLShiftTo(n, r) {
		var i;
		for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
		for (i = n - 1; i >= 0; --i) r[i] = 0;
		r.t = this.t + n;
		r.s = this.s
	}
	function bnpDRShiftTo(n, r) {
		for (var i = n; i < this.t; ++i) r[i - n] = this[i];
		r.t = Math.max(this.t - n, 0);
		r.s = this.s
	}
	function bnpLShiftTo(n, r) {
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << cbs) - 1;
		var ds = Math.floor(n / this.DB),
			c = this.s << bs & this.DM,
			i;
		for (i = this.t - 1; i >= 0; --i) {
			r[i + ds + 1] = this[i] >> cbs | c;
			c = (this[i] & bm) << bs
		}
		for (i = ds - 1; i >= 0; --i) r[i] = 0;
		r[ds] = c;
		r.t = this.t + ds + 1;
		r.s = this.s;
		r.clamp()
	}
	function bnpRShiftTo(n, r) {
		r.s = this.s;
		var ds = Math.floor(n / this.DB);
		if (ds >= this.t) {
			r.t = 0;
			return
		}
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << bs) - 1;
		r[0] = this[ds] >> bs;
		for (var i = ds + 1; i < this.t; ++i) {
			r[i - ds - 1] |= (this[i] & bm) << cbs;
			r[i - ds] = this[i] >> bs
		}
		if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
		r.t = this.t - ds;
		r.clamp()
	}
	function bnpSubTo(a, r) {
		var i = 0,
			c = 0,
			m = Math.min(a.t, this.t);
		while (i < m) {
			c += this[i] - a[i];
			r[i++] = c & this.DM;
			c >>= this.DB
		}
		if (a.t < this.t) {
			c -= a.s;
			while (i < this.t) {
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB
			}
			c += this.s
		} else {
			c += this.s;
			while (i < a.t) {
				c -= a[i];
				r[i++] = c & this.DM;
				c >>= this.DB
			}
			c -= a.s
		}
		r.s = c < 0 ? -1 : 0;
		if (c < -1) r[i++] = this.DV + c;
		else if (c > 0) r[i++] = c;
		r.t = i;
		r.clamp()
	}
	function bnpMultiplyTo(a, r) {
		var x = this.abs(),
			y = a.abs();
		var i = x.t;
		r.t = i + y.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
		r.s = 0;
		r.clamp();
		if (this.s != a.s) BigInteger.ZERO.subTo(r, r)
	}
	function bnpSquareTo(r) {
		var x = this.abs();
		var i = r.t = 2 * x.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < x.t - 1; ++i) {
			var c = x.am(i, x[i], r, 2 * i, 0, 1);
			if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
				r[i + x.t] -= x.DV;
				r[i + x.t + 1] = 1
			}
		}
		if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
		r.s = 0;
		r.clamp()
	}
	function bnpDivRemTo(m, q, r) {
		var pm = m.abs();
		if (pm.t <= 0) return;
		var pt = this.abs();
		if (pt.t < pm.t) {
			if (q != null) q.fromInt(0);
			if (r != null) this.copyTo(r);
			return
		}
		if (r == null) r = nbi();
		var y = nbi(),
			ts = this.s,
			ms = m.s;
		var nsh = this.DB - nbits(pm[pm.t - 1]);
		if (nsh > 0) {
			pm.lShiftTo(nsh, y);
			pt.lShiftTo(nsh, r)
		} else {
			pm.copyTo(y);
			pt.copyTo(r)
		}
		var ys = y.t;
		var y0 = y[ys - 1];
		if (y0 == 0) return;
		var yt = y0 * (1 << this.F1) + (ys > 1 ? y[ys - 2] >> this.F2 : 0);
		var d1 = this.FV / yt,
			d2 = (1 << this.F1) / yt,
			e = 1 << this.F2;
		var i = r.t,
			j = i - ys,
			t = q == null ? nbi() : q;
		y.dlShiftTo(j, t);
		if (r.compareTo(t) >= 0) {
			r[r.t++] = 1;
			r.subTo(t, r)
		}
		BigInteger.ONE.dlShiftTo(ys, t);
		t.subTo(y, y);
		while (y.t < ys) y[y.t++] = 0;
		while (--j >= 0) {
			var qd = r[--i] == y0 ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
			if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
				y.dlShiftTo(j, t);
				r.subTo(t, r);
				while (r[i] < --qd) r.subTo(t, r)
			}
		}
		if (q != null) {
			r.drShiftTo(ys, q);
			if (ts != ms) BigInteger.ZERO.subTo(q, q)
		}
		r.t = ys;
		r.clamp();
		if (nsh > 0) r.rShiftTo(nsh, r);
		if (ts < 0) BigInteger.ZERO.subTo(r, r)
	}
	function bnMod(a) {
		var r = nbi();
		this.abs().divRemTo(a, null, r);
		if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
		return r
	}
	function Classic(m) {
		this.m = m
	}
	function cConvert(x) {
		if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
		else return x
	}
	function cRevert(x) {
		return x
	}
	function cReduce(x) {
		x.divRemTo(this.m, null, x)
	}
	function cMulTo(x, y, r) {
		x.multiplyTo(y, r);
		this.reduce(r)
	}
	function cSqrTo(x, r) {
		x.squareTo(r);
		this.reduce(r)
	}
	Classic.prototype.convert = cConvert;
	Classic.prototype.revert = cRevert;
	Classic.prototype.reduce = cReduce;
	Classic.prototype.mulTo = cMulTo;
	Classic.prototype.sqrTo = cSqrTo;

	function bnpInvDigit() {
		if (this.t < 1) return 0;
		var x = this[0];
		if ((x & 1) == 0) return 0;
		var y = x & 3;
		y = y * (2 - (x & 15) * y) & 15;
		y = y * (2 - (x & 255) * y) & 255;
		y = y * (2 - ((x & 65535) * y & 65535)) & 65535;
		y = y * (2 - x * y % this.DV) % this.DV;
		return y > 0 ? this.DV - y : -y
	}
	function Montgomery(m) {
		this.m = m;
		this.mp = m.invDigit();
		this.mpl = this.mp & 32767;
		this.mph = this.mp >> 15;
		this.um = (1 << m.DB - 15) - 1;
		this.mt2 = 2 * m.t
	}
	function montConvert(x) {
		var r = nbi();
		x.abs().dlShiftTo(this.m.t, r);
		r.divRemTo(this.m, null, r);
		if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
		return r
	}
	function montRevert(x) {
		var r = nbi();
		x.copyTo(r);
		this.reduce(r);
		return r
	}
	function montReduce(x) {
		while (x.t <= this.mt2) x[x.t++] = 0;
		for (var i = 0; i < this.m.t; ++i) {
			var j = x[i] & 32767;
			var u0 = j * this.mpl + ((j * this.mph + (x[i] >> 15) * this.mpl & this.um) << 15) & x.DM;
			j = i + this.m.t;
			x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
			while (x[j] >= x.DV) {
				x[j] -= x.DV;
				x[++j]++
			}
		}
		x.clamp();
		x.drShiftTo(this.m.t, x);
		if (x.compareTo(this.m) >= 0) x.subTo(this.m, x)
	}
	function montSqrTo(x, r) {
		x.squareTo(r);
		this.reduce(r)
	}
	function montMulTo(x, y, r) {
		x.multiplyTo(y, r);
		this.reduce(r)
	}
	Montgomery.prototype.convert = montConvert;
	Montgomery.prototype.revert = montRevert;
	Montgomery.prototype.reduce = montReduce;
	Montgomery.prototype.mulTo = montMulTo;
	Montgomery.prototype.sqrTo = montSqrTo;

	function bnpIsEven() {
		return (this.t > 0 ? this[0] & 1 : this.s) == 0
	}
	function bnpExp(e, z) {
		if (e > 4294967295 || e < 1) return BigInteger.ONE;
		var r = nbi(),
			r2 = nbi(),
			g = z.convert(this),
			i = nbits(e) - 1;
		g.copyTo(r);
		while (--i >= 0) {
			z.sqrTo(r, r2);
			if ((e & 1 << i) > 0) z.mulTo(r2, g, r);
			else {
				var t = r;
				r = r2;
				r2 = t
			}
		}
		return z.revert(r)
	}
	function bnModPowInt(e, m) {
		var z;
		if (e < 256 || m.isEven()) z = new Classic(m);
		else z = new Montgomery(m);
		return this.exp(e, z)
	}
	BigInteger.prototype.copyTo = bnpCopyTo;
	BigInteger.prototype.fromInt = bnpFromInt;
	BigInteger.prototype.fromString = bnpFromString;
	BigInteger.prototype.clamp = bnpClamp;
	BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
	BigInteger.prototype.drShiftTo = bnpDRShiftTo;
	BigInteger.prototype.lShiftTo = bnpLShiftTo;
	BigInteger.prototype.rShiftTo = bnpRShiftTo;
	BigInteger.prototype.subTo = bnpSubTo;
	BigInteger.prototype.multiplyTo = bnpMultiplyTo;
	BigInteger.prototype.squareTo = bnpSquareTo;
	BigInteger.prototype.divRemTo = bnpDivRemTo;
	BigInteger.prototype.invDigit = bnpInvDigit;
	BigInteger.prototype.isEven = bnpIsEven;
	BigInteger.prototype.exp = bnpExp;
	BigInteger.prototype.toString = bnToString;
	BigInteger.prototype.negate = bnNegate;
	BigInteger.prototype.abs = bnAbs;
	BigInteger.prototype.compareTo = bnCompareTo;
	BigInteger.prototype.bitLength = bnBitLength;
	BigInteger.prototype.mod = bnMod;
	BigInteger.prototype.modPowInt = bnModPowInt;
	BigInteger.ZERO = nbv(0);
	BigInteger.ONE = nbv(1);

	function bnpFromRadix(s, b) {
		this.fromInt(0);
		if (b == null) b = 10;
		var cs = this.chunkSize(b);
		var d = Math.pow(b, cs),
			mi = false,
			j = 0,
			w = 0;
		for (var i = 0; i < s.length; ++i) {
			var x = intAt(s, i);
			if (x < 0) {
				if (s.charAt(i) == "-" && this.signum() == 0) mi = true;
				continue
			}
			w = b * w + x;
			if (++j >= cs) {
				this.dMultiply(d);
				this.dAddOffset(w, 0);
				j = 0;
				w = 0
			}
		}
		if (j > 0) {
			this.dMultiply(Math.pow(b, j));
			this.dAddOffset(w, 0)
		}
		if (mi) BigInteger.ZERO.subTo(this, this)
	}
	function bnpChunkSize(r) {
		return Math.floor(Math.LN2 * this.DB / Math.log(r))
	}
	function bnSigNum() {
		if (this.s < 0) return -1;
		else if (this.t <= 0 || this.t == 1 && this[0] <= 0) return 0;
		else return 1
	}
	function bnpDMultiply(n) {
		this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
		++this.t;
		this.clamp()
	}
	function bnpDAddOffset(n, w) {
		if (n == 0) return;
		while (this.t <= w) this[this.t++] = 0;
		this[w] += n;
		while (this[w] >= this.DV) {
			this[w] -= this.DV;
			if (++w >= this.t) this[this.t++] = 0;
			++this[w]
		}
	}
	function bnpToRadix(b) {
		if (b == null) b = 10;
		if (this.signum() == 0 || b < 2 || b > 36) return "0";
		var cs = this.chunkSize(b);
		var a = Math.pow(b, cs);
		var d = nbv(a),
			y = nbi(),
			z = nbi(),
			r = "";
		this.divRemTo(d, y, z);
		while (y.signum() > 0) {
			r = (a + z.intValue()).toString(b).substr(1) + r;
			y.divRemTo(d, y, z)
		}
		return z.intValue().toString(b) + r
	}
	function bnIntValue() {
		if (this.s < 0) {
			if (this.t == 1) return this[0] - this.DV;
			else if (this.t == 0) return -1
		} else if (this.t == 1) return this[0];
		else if (this.t == 0) return 0;
		return (this[1] & (1 << 32 - this.DB) - 1) << this.DB | this[0]
	}
	function bnpAddTo(a, r) {
		var i = 0,
			c = 0,
			m = Math.min(a.t, this.t);
		while (i < m) {
			c += this[i] + a[i];
			r[i++] = c & this.DM;
			c >>= this.DB
		}
		if (a.t < this.t) {
			c += a.s;
			while (i < this.t) {
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB
			}
			c += this.s
		} else {
			c += this.s;
			while (i < a.t) {
				c += a[i];
				r[i++] = c & this.DM;
				c >>= this.DB
			}
			c += a.s
		}
		r.s = c < 0 ? -1 : 0;
		if (c > 0) r[i++] = c;
		else if (c < -1) r[i++] = this.DV + c;
		r.t = i;
		r.clamp()
	}
	BigInteger.prototype.fromRadix = bnpFromRadix;
	BigInteger.prototype.chunkSize = bnpChunkSize;
	BigInteger.prototype.signum = bnSigNum;
	BigInteger.prototype.dMultiply = bnpDMultiply;
	BigInteger.prototype.dAddOffset = bnpDAddOffset;
	BigInteger.prototype.toRadix = bnpToRadix;
	BigInteger.prototype.intValue = bnIntValue;
	BigInteger.prototype.addTo = bnpAddTo;
	var Wrapper = {
		abs: (function(l, h) {
			var x = new goog.math.Long(l, h);
			var ret;
			if (x.isNegative()) {
				ret = x.negate()
			} else {
				ret = x
			}
			HEAP32[tempDoublePtr >> 2] = ret.low_;
			HEAP32[tempDoublePtr + 4 >> 2] = ret.high_
		}),
		ensureTemps: (function() {
			if (Wrapper.ensuredTemps) return;
			Wrapper.ensuredTemps = true;
			Wrapper.two32 = new BigInteger;
			Wrapper.two32.fromString("4294967296", 10);
			Wrapper.two64 = new BigInteger;
			Wrapper.two64.fromString("18446744073709551616", 10);
			Wrapper.temp1 = new BigInteger;
			Wrapper.temp2 = new BigInteger
		}),
		lh2bignum: (function(l, h) {
			var a = new BigInteger;
			a.fromString(h.toString(), 10);
			var b = new BigInteger;
			a.multiplyTo(Wrapper.two32, b);
			var c = new BigInteger;
			c.fromString(l.toString(), 10);
			var d = new BigInteger;
			c.addTo(b, d);
			return d
		}),
		stringify: (function(l, h, unsigned) {
			var ret = (new goog.math.Long(l, h)).toString();
			if (unsigned && ret[0] == "-") {
				Wrapper.ensureTemps();
				var bignum = new BigInteger;
				bignum.fromString(ret, 10);
				ret = new BigInteger;
				Wrapper.two64.addTo(bignum, ret);
				ret = ret.toString(10)
			}
			return ret
		}),
		fromString: (function(str, base, min, max, unsigned) {
			Wrapper.ensureTemps();
			var bignum = new BigInteger;
			bignum.fromString(str, base);
			var bigmin = new BigInteger;
			bigmin.fromString(min, 10);
			var bigmax = new BigInteger;
			bigmax.fromString(max, 10);
			if (unsigned && bignum.compareTo(BigInteger.ZERO) < 0) {
				var temp = new BigInteger;
				bignum.addTo(Wrapper.two64, temp);
				bignum = temp
			}
			var error = false;
			if (bignum.compareTo(bigmin) < 0) {
				bignum = bigmin;
				error = true
			} else if (bignum.compareTo(bigmax) > 0) {
				bignum = bigmax;
				error = true
			}
			var ret = goog.math.Long.fromString(bignum.toString());
			HEAP32[tempDoublePtr >> 2] = ret.low_;
			HEAP32[tempDoublePtr + 4 >> 2] = ret.high_;
			if (error) throw "range error"
		})
	};
	return Wrapper
})();
if (memoryInitializer) {
	if (typeof Module["locateFile"] === "function") {
		memoryInitializer = Module["locateFile"](memoryInitializer)
	} else if (Module["memoryInitializerPrefixURL"]) {
		memoryInitializer = Module["memoryInitializerPrefixURL"] + memoryInitializer
	}
	if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
		var data = Module["readBinary"](memoryInitializer);
		HEAPU8.set(data, STATIC_BASE)
	} else {
		addRunDependency("memory initializer");
		Browser.asyncLoad(memoryInitializer, (function(data) {
			HEAPU8.set(data, STATIC_BASE);
			removeRunDependency("memory initializer")
		}), (function(data) {
			throw "could not load memory initializer " + memoryInitializer
		}))
	}
}
function ExitStatus(status) {
	this.name = "ExitStatus";
	this.message = "Program terminated with exit(" + status + ")";
	this.status = status
}
ExitStatus.prototype = new Error;
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
var preloadStartTime = null;
var calledMain = false;
dependenciesFulfilled = function runCaller() {
	if (!Module["calledRun"] && shouldRunNow) run();
	if (!Module["calledRun"]) dependenciesFulfilled = runCaller
};
Module["callMain"] = Module.callMain = function callMain(args) {
	assert(runDependencies == 0, "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
	assert(__ATPRERUN__.length == 0, "cannot call main when preRun functions remain to be called");
	args = args || [];
	ensureInitRuntime();
	var argc = args.length + 1;

	function pad() {
		for (var i = 0; i < 4 - 1; i++) {
			argv.push(0)
		}
	}
	var argv = [allocate(intArrayFromString(Module["thisProgram"]), "i8", ALLOC_NORMAL)];
	pad();
	for (var i = 0; i < argc - 1; i = i + 1) {
		argv.push(allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL));
		pad()
	}
	argv.push(0);
	argv = allocate(argv, "i32", ALLOC_NORMAL);
	initialStackTop = STACKTOP;
	try {
		var ret = Module["_main"](argc, argv, 0);
		exit(ret)
	} catch (e) {
		if (e instanceof ExitStatus) {
			return
		} else if (e == "SimulateInfiniteLoop") {
			Module["noExitRuntime"] = true;
			return
		} else {
			if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]);
			throw e
		}
	} finally {
		calledMain = true
	}
};

function run(args) {
	args = args || Module["arguments"];
	if (preloadStartTime === null) preloadStartTime = Date.now();
	if (runDependencies > 0) {
		return
	}
	preRun();
	if (runDependencies > 0) return;
	if (Module["calledRun"]) return;

	function doRun() {
		if (Module["calledRun"]) return;
		Module["calledRun"] = true;
		if (ABORT) return;
		ensureInitRuntime();
		preMain();
		if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
			Module.printErr("pre-main prep time: " + (Date.now() - preloadStartTime) + " ms")
		}
		if (Module["_main"] && shouldRunNow) {
			Module["callMain"](args)
		}
		postRun()
	}
	if (Module["setStatus"]) {
		Module["setStatus"]("Running...");
		setTimeout((function() {
			setTimeout((function() {
				Module["setStatus"]("")
			}), 1);
			doRun()
		}), 1)
	} else {
		doRun()
	}
}
Module["run"] = Module.run = run;

function exit(status) {
	if (Module["noExitRuntime"]) {
		return
	}
	ABORT = true;
	EXITSTATUS = status;
	STACKTOP = initialStackTop;
	exitRuntime();
	if (ENVIRONMENT_IS_NODE) {
		process["stdout"]["once"]("drain", (function() {
			process["exit"](status)
		}));
		//console.log(" ");
		setTimeout((function() {
			process["exit"](status)
		}), 500)
	} else if (ENVIRONMENT_IS_SHELL && typeof quit === "function") {
		quit(status)
	}
	throw new ExitStatus(status)
}
Module["exit"] = Module.exit = exit;

function abort(text) {
	if (text) {
		Module.print(text);
		Module.printErr(text)
	}
	ABORT = true;
	EXITSTATUS = 1;
	var extra = "\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.";
	throw "abort() at " + stackTrace() + extra
}
Module["abort"] = Module.abort = abort;
if (Module["preInit"]) {
	if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
	while (Module["preInit"].length > 0) {
		Module["preInit"].pop()()
	}
}
var shouldRunNow = false;
if (Module["noInitialRun"]) {
	shouldRunNow = false
}
run()
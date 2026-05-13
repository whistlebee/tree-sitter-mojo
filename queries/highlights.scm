; ============================================================================
; Mojo Tree-sitter Syntax Highlighting Queries
; ============================================================================
; Inspired by official mojo-syntax token categories and adapted to this grammar.

; ----------------------------------------------------------------------------
; Keywords
; ----------------------------------------------------------------------------

[
  "def"
  "fn"
] @keyword.function

[
  "class"
  "struct"
  "trait"
] @keyword.type

"comptime" @keyword.directive

(assignment
  "var" @keyword.storage)

[
  "if"
  "elif"
  "else"
  "for"
  "while"
  "try"
  "except"
  "finally"
  "with"
  "match"
  "case"
  "return"
  "yield"
  "raise"
  "assert"
] @keyword.control

(break_statement) @keyword.control
(continue_statement) @keyword.control
(pass_statement) @keyword.control

(import_statement
  "import" @keyword.import)

(import_from_statement
  "from" @keyword.import
  "import" @keyword.import)

(aliased_import
  "as" @keyword.import)

(as_pattern
  "as" @keyword)

[
  "async"
  "await"
  "lambda"
] @keyword

[
  "and"
  "or"
  "not"
  "in"
  "is"
] @keyword.operator

[
  "raises"
  "capturing"
  "thin"
] @keyword.modifier

(abi_effect
  "abi" @keyword.modifier)

(capture_default) @keyword.modifier
(capture_convention) @keyword.modifier

(argument_convention
  [
    "read"
    "mut"
    "var"
    "out"
    "deinit"
    "ref"
  ] @keyword.modifier)

; ----------------------------------------------------------------------------
; Functions, Types, and Variables
; ----------------------------------------------------------------------------

(function_definition
  name: (identifier) @function)

(call
  function: (identifier) @function.call)

(call
  function: (attribute
    attribute: (identifier) @function.method.call))

(call
  function: (subscript
    value: (identifier) @function.call))

(call
  function: (subscript
    value: (attribute
      attribute: (identifier) @function.method.call)))

(class_definition
  name: (identifier) @type)

(type
  (identifier) @type)

(meta_parameter
  name: (identifier) @type.parameter)

(typed_parameter
  name: (identifier) @variable.parameter)

(convention_parameter
  name: (identifier) @variable.parameter)

(default_parameter
  name: (identifier) @variable.parameter)

(typed_default_parameter
  name: (identifier) @variable.parameter)

(keyword_argument
  name: (identifier) @label)

(argument_convention
  (identifier) @label)

((identifier) @variable.builtin
  (#eq? @variable.builtin "self"))

((identifier) @variable.builtin
  (#eq? @variable.builtin "cls"))

(assignment
  left: (identifier) @variable)

(comptime_declaration
  name: (identifier) @variable)

(attribute
  attribute: (identifier) @property)

; Re-apply call captures after the generic property rule so subscripted
; compile-time call targets like `a.b[c](d)` still color `b` as a method call.
(call
  function: (attribute
    attribute: (identifier) @function.method.call))

(call
  function: (subscript
    value: (identifier) @function.call))

(call
  function: (subscript
    value: (attribute
      attribute: (identifier) @function.method.call)))

; ----------------------------------------------------------------------------
; Decorators, Builtins, Constants, Literals
; ----------------------------------------------------------------------------

(decorator
  "@" @punctuation.special)

(decorator
  (expression
    (identifier) @keyword.directive
    (#match? @keyword.directive "^(align|always_inline|__copy_capture|deprecated|explicit_destroy|export|fieldwise_init|implicit|no_inline|nonmaterializable|parameter|register_passable|staticmethod)$")))

(decorator
  (expression
    (attribute
      object: (identifier) @module
      attribute: (identifier) @keyword.directive
      (#eq? @module "compiler")
      (#eq? @keyword.directive "register"))))

(decorator
  (expression
    (call
      function: (identifier) @keyword.directive
      (#match? @keyword.directive "^(align|always_inline|__copy_capture|deprecated|explicit_destroy|export|fieldwise_init|implicit|no_inline|nonmaterializable|parameter|register_passable|staticmethod)$"))))

(decorator
  (expression
    (call
      function: (attribute
        object: (identifier) @module
        attribute: (identifier) @keyword.directive
        (#eq? @module "compiler")
        (#eq? @keyword.directive "register")))))

(decorator
  (expression
    (identifier) @function.decorator
    (#not-match? @function.decorator "^(align|always_inline|__copy_capture|deprecated|explicit_destroy|export|fieldwise_init|implicit|no_inline|nonmaterializable|parameter|register_passable|staticmethod)$")))

(decorator
  (expression
    (attribute
      object: (identifier) @module
      attribute: (identifier) @function.decorator
      (#not-eq? @module "compiler"))))

(decorator
  (expression
    (attribute
      object: (identifier) @module
      attribute: (identifier) @function.decorator
      (#eq? @module "compiler")
      (#not-eq? @function.decorator "register"))))

(decorator
  (expression
    (call
      function: (identifier) @function.decorator
      (#not-match? @function.decorator "^(align|always_inline|__copy_capture|deprecated|explicit_destroy|export|fieldwise_init|implicit|no_inline|nonmaterializable|parameter|register_passable|staticmethod)$"))))

(decorator
  (expression
    (call
      function: (attribute
        object: (identifier) @module
        attribute: (identifier) @function.decorator
        (#not-eq? @module "compiler")))))

(decorator
  (expression
    (call
      function: (attribute
        object: (identifier) @module
        attribute: (identifier) @function.decorator
        (#eq? @module "compiler")
        (#not-eq? @function.decorator "register")))))


(call
  function: (identifier) @function.builtin
  (#match? @function.builtin "^(__import__|abs|all|any|ascii|bin|bool|breakpoint|bytearray|bytes|callable|chr|compile|complex|dict|dir|divmod|enumerate|eval|exec|filter|float|format|getattr|globals|hasattr|hash|hex|id|input|int|isinstance|issubclass|iter|len|list|locals|map|max|memoryview|min|next|object|oct|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|vars|zip)$"))

(type
  (identifier) @type.builtin
  (#match? @type.builtin "^(__mlir_attr|__mlir_op|__mlir_type|Int|Float16|Float32|Float64|Bool|String|SIMD|DType|Pointer|UnsafePointer|List|Dict|Set|Tuple|Optional|None|int|float|bool|str|list|dict|set|tuple|type|object)$"))

(assignment
  left: (identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]+$"))

(true) @constant.builtin
(false) @constant.builtin
(none) @constant.builtin
(ellipsis) @constant.builtin

(integer) @number
(float) @number.float

(string) @string
(escape_sequence) @string.escape

(comment) @comment

; ----------------------------------------------------------------------------
; Operators and Punctuation
; ----------------------------------------------------------------------------

(transfer_expression
  "^" @operator.special)

(binary_operator
  operator: [
    "+"
    "-"
    "*"
    "/"
    "//"
    "%"
    "**"
    "<<"
    ">>"
    "&"
    "|"
    "@"
    "^"
  ] @operator)

(unary_operator
  operator: [
    "+"
    "-"
    "~"
  ] @operator)

(comparison_operator
  operators: [
    "=="
    "!="
    "<"
    "<="
    ">"
    ">="
    "<>"
  ] @operator)

(comparison_operator
  operators: [
    "in"
    "not in"
    "is"
    "is not"
  ] @keyword.operator)

(augmented_assignment
  operator: [
    "+="
    "-="
    "*="
    "/="
    "//="
    "%="
    "**="
    "<<="
    ">>="
    "&="
    "|="
    "^="
    "@="
  ] @operator)

(assignment
  "=" @operator)

(named_expression
  ":=" @operator)

"->" @punctuation.special

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  "."
  ":"
  ";"
] @punctuation.delimiter

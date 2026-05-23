; Neovim fallback query for older installed parser binaries.
; Uses only conservative node names and standard captures.

[
  "def"
  "fn"
] @keyword.function

[
  "struct"
  "trait"
] @keyword.type

[
  "if"
  "elif"
  "else"
  "for"
  "while"
  "with"
  "return"
  "raise"
] @keyword.control

(break_statement) @keyword.control
(continue_statement) @keyword.control
(pass_statement) @keyword.control

[
  "import"
  "from"
] @keyword.import

"as" @keyword

[
  "and"
  "or"
  "not"
  "in"
  "is"
] @keyword.operator

[
  "var"
  "ref"
] @keyword.storage

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

"comptime" @keyword.directive

(comment) @comment
(string) @string
(escape_sequence) @string.escape
(integer) @number
(float) @number.float

(function_definition
  name: (identifier) @function)

(struct_definition
  name: (identifier) @type)

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

(keyword_argument
  name: (identifier) @label)

(argument_convention
  (identifier) @label)

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

(assignment
  "=" @operator)

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

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Precedence levels - based on Python with Mojo additions
const PREC = {
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  parenthesized_list_splat: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
  transfer: 23, // NEW: ownership transfer operator ^
};

const SEMICOLON = ";";

module.exports = grammar({
  name: "mojo",

  extras: ($) => [
    $.comment,
    /[\s\f\uFEFF\u2060\u200B]|\r?\n/,
    $.line_continuation,
  ],

  conflicts: ($) => [
    [$.primary_expression, $.pattern],
    [$.primary_expression, $.list_splat_pattern],
    [$.tuple, $.tuple_pattern],
    [$.list, $.list_pattern],
    [$.with_item, $._collection_elements],
    [$.type_alias_statement, $.primary_expression],
    [$.primary_expression, $.type],
    // NEW: Mojo-specific conflicts
    [$.parameter, $.typed_parameter],
    [$.subscript, $.meta_parameters],
    [$.transfer_expression, $.binary_operator],
    [$.transfer_expression, $.binary_operator, $.unary_operator],
    [$.transfer_expression, $.binary_operator, $.await],
    [$.function_modifier],
    [$.comptime_declaration, $.primary_expression],
    [$.comptime_declaration, $.pattern],
    [$.comptime_member_declaration, $.pattern],
    [$.comptime_member_declaration, $.primary_expression],
    [$.comptime_declaration, $.comptime_member_declaration, $.primary_expression],
    [$.comptime_declaration, $.comptime_member_declaration, $.pattern],
    [$.primary_expression, $.concatenated_string],
    [$.concatenated_string],
    [$.comptime_declaration, $.comptime_member_declaration],
    [$.pattern_list],
    [$.primary_expression, $.keyword_argument],
  ],

  supertypes: ($) => [
    $._simple_statement,
    $._compound_statement,
    $.expression,
    $.primary_expression,
    $.pattern,
    $.parameter,
  ],

  externals: ($) => [
    $._newline,
    $._indent,
    $._dedent,
    $.string_start,
    $._string_content,
    $.escape_interpolation,
    $.string_end,
    $.comment,
    "]",
    ")",
    "}",
    "except",
  ],

  inline: ($) => [
    $._simple_statement,
    $._compound_statement,
    $._suite,
    $._expressions,
    $._left_hand_side,
    $.keyword_identifier,
  ],

  word: ($) => $.identifier,

  rules: {
    module: ($) => repeat($._statement),

    // MOJO: Modifiers
    comptime_modifier: ($) => "comptime",

    // ====================
    // Statements
    // ====================

    _statement: ($) => choice($._simple_statements, $._compound_statement),

    // Simple statements (one per line or separated by semicolons)
    _simple_statements: ($) =>
      seq(
        sep1($._simple_statement, SEMICOLON),
        optional(SEMICOLON),
        $._newline,
      ),

    _simple_statement: ($) =>
      choice(
        $.import_statement,
        $.import_from_statement,
        $.assert_statement,
        $.expression_statement,
        $.return_statement,
        $.raise_statement,
        $.pass_statement,
        $.break_statement,
        $.continue_statement,
        $.type_alias_statement,
        $.comptime_declaration, // NEW: Mojo comptime
        $.comptime_assert_statement, // NEW: Mojo comptime assert
      ),

    // ====================
    // Compound Statements
    // ====================

    _compound_statement: ($) =>
      choice(
        $.if_statement,
        $.for_statement,
        $.while_statement,
        $.try_statement,
        $.with_statement,
        $.function_definition,
        $.struct_definition,
        $.trait_definition,
        $.extension_definition,
        $.decorated_definition,
        $.mlir_region_statement,
      ),

    // ====================
    // MOJO: Function Definition
    // ====================

    function_definition: ($) =>
      seq(
        optional("async"),
        field("keyword", choice("def", "fn")), // NEW: fn keyword
        field("name", $.identifier),
        optional(field("meta_parameters", $.meta_parameters)), // NEW: meta params
        field("parameters", $.parameters),
        optional(
          choice(
            seq(
              optional(seq("->", field("return_type", $.type))),
              repeat(field("modifiers", $.function_modifier)),
              optional(field("captures", $.capture_list)),
            ),
            seq(
              repeat1(field("modifiers", $.function_modifier)),
              optional(field("captures", $.capture_list)),
              optional(seq("->", field("return_type", $.type))),
            ),
            seq(
              repeat1(field("modifiers", $.function_modifier)),
              optional(seq("->", field("return_type", $.type))),
              optional(field("captures", $.capture_list)),
            ),
            seq(
              field("captures", $.capture_list),
              optional(seq("->", field("return_type", $.type))),
            ),
          ),
        ),
        optional(field("where_clause", $.where_clause)),
        ":",
        field("body", $._suite),
      ),

    where_clause: ($) => repeat1(seq("where", field("constraint", $.expression))),

    // NEW: Meta parameters for compile-time generics [T: Type, N: Int]
    meta_parameters: ($) =>
      seq("[", optional(seq(commaSep1(choice($.meta_parameter, $.keyword_separator, $.positional_separator, $.infer_separator)), optional(","))), "]"),

    meta_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.soft_keyword_identifier, $.list_splat_pattern, $.dictionary_splat_pattern)),
        optional(seq(":", field("type", $.type))),
        optional(seq("=", field("default", $.expression))),
      ),

    // Function effects supported by recent Mojo releases plus legacy capturing.
    function_modifier: ($) =>
      choice(
        seq("raises", optional($.type)),
        "thin",
        "capturing",
        prec(2, seq("capturing", "[", commaSep1($.expression), "]")),
        "register_passable",
        $.abi_effect,
      ),

    abi_effect: ($) => seq("abi", "(", $.string, ")"),

    // Parameters (runtime arguments)
    parameters: ($) => seq("(", optional($._parameters), ")"),

    _parameters: ($) => seq(commaSep1($.parameter), optional(",")),

    // NEW: Parameter with optional argument convention
    parameter: ($) =>
      choice(
        $.identifier,
        $.typed_parameter,
        $.convention_parameter, // NEW: for 'out self', 'deinit self', etc.
        $.default_parameter,
        $.typed_default_parameter,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.keyword_separator,
        $.positional_separator,
        $.infer_separator,
        $.dictionary_splat_pattern,
      ),

    typed_parameter: ($) =>
      prec(
        PREC.typed_parameter + 10,
        seq(
          optional(field("convention", $.argument_convention)), // NEW: mut, var, etc.
          field("name", choice($.identifier, $.soft_keyword_identifier, $.list_splat_pattern, $.dictionary_splat_pattern)),
          ":",
          field("type", $.type),
        ),
      ),

    // NEW: Parameter with convention but no type (e.g., 'out self')
    convention_parameter: ($) =>
      prec.left(
        PREC.typed_parameter - 1,
        seq(
          field("convention", $.argument_convention),
          field("name", choice($.identifier, $.soft_keyword_identifier)),
        ),
      ),

    // NEW: Argument conventions
    argument_convention: ($) =>
      choice(
        "read",
        "mut",
        "var",
        "out",
        "deinit",
        "ref",
        prec(2, seq(
          "ref",
          "[",
          field("origin", choice($.expression, $.keyword_argument)),
          repeat(seq(",", choice($.expression, $.keyword_argument))),
          optional(","),
          "]"
        )),
      ),

    capture_list: ($) =>
      seq("{", optional(seq(commaSep1($.capture_item), optional(","))), "}"),

    capture_item: ($) => choice($.capture_default, $.capture_binding),

    capture_default: (_) =>
      choice("read", "mut", "var", "out", "deinit", "ref"),

    capture_binding: ($) =>
      seq(
        optional(field("convention", $.capture_convention)),
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        optional("^"),
      ),

    capture_convention: (_) =>
      choice("read", "mut", "var", "out", "deinit", "ref"),

    default_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        "=",
        field("value", $.expression),
      ),

    typed_default_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        seq(
          optional(field("convention", $.argument_convention)), // NEW
          field("name", choice($.identifier, $.soft_keyword_identifier)),
          ":",
          field("type", $.type),
          "=",
          field("value", $.expression),
        ),
      ),

    list_splat_pattern: ($) =>
      seq("*", choice($.identifier, $.soft_keyword_identifier)),

    dictionary_splat_pattern: ($) =>
      seq("**", choice($.identifier, $.soft_keyword_identifier)),

    // ====================
    // MOJO: Class/Struct/Trait Definition
    // ====================

    struct_definition: ($) =>
      seq(
        field("keyword", "struct"),
        field("name", $.identifier),
        optional(field("meta_parameters", $.meta_parameters)),
        optional(field("superclasses", $.struct_superclasses)),
        optional(field("where_clause", $.where_clause)),
        ":",
        field("body", $._suite),
      ),

    trait_definition: ($) =>
      seq(
        field("keyword", "trait"),
        field("name", $.identifier),
        optional(field("meta_parameters", $.meta_parameters)),
        optional(field("superclasses", $.struct_superclasses)),
        optional(field("where_clause", $.where_clause)),
        ":",
        field("body", $._trait_suite),
      ),

    extension_definition: ($) =>
      seq(
        "__extension",
        field("name", $.identifier),
        optional(field("meta_parameters", $.meta_parameters)),
        ":",
        field("body", $._suite),
      ),

    struct_superclasses: ($) =>
      prec(
        1,
        seq(
          "(",
          optional(
            commaSep1(
              choice(
                $.expression,
                prec(10, seq($.expression, $.where_clause)),
              ),
            ),
          ),
          optional(","),
          ")",
        ),
      ),

    // ====================
    // MOJO: Compile-time Declaration
    // ====================

    comptime_declaration: ($) =>
      choice(
        seq(
          "comptime",
          field("name", choice($.identifier, $.soft_keyword_identifier)),
          field("meta_parameters", $.meta_parameters),
          choice(
            seq(":", field("type", $.type), seq("=", field("value", $.expression))),
            seq("=", field("value", $.expression)),
          ),
        ),
        seq(
          "comptime",
          field("left", $._left_hand_side),
          choice(
            seq("=", field("right", $._right_hand_side)),
            seq(":", field("type", $.type)),
            seq(
              ":",
              field("type", $.type),
              "=",
              field("right", $._right_hand_side),
            ),
          ),
        ),
      ),

    comptime_member_declaration: ($) =>
      seq(
        "comptime",
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        optional(field("meta_parameters", $.meta_parameters)),
        choice(
          seq(":", field("type", $.type), optional(seq("=", field("value", $.expression)))),
          seq("=", field("value", $.expression)),
        ),
      ),

    // ====================
    // Other Compound Statements (simplified)
    // ====================

    decorated_definition: ($) =>
      seq(
        repeat1($.decorator),
        field(
          "definition",
          choice(
            $.struct_definition,
            $.trait_definition,
            $.function_definition,
            $.if_statement,
            $.for_statement,
            $.comptime_declaration,
            $.comptime_member_declaration,
            $.extension_definition,
            $.assignment,
          ),
        ),
      ),

    decorator: ($) => seq("@", $.expression, $._newline),

    if_statement: ($) =>
      seq(
        optional($.comptime_modifier),
        "if",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
        repeat(field("alternative", $.elif_clause)),
        optional(field("alternative", $.else_clause)),
      ),

    elif_clause: ($) =>
      seq(
        "elif",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
      ),

    else_clause: ($) => seq("else", ":", field("body", $._suite)),


    for_statement: ($) =>
      seq(
        optional($.comptime_modifier),
        "for",
        field("left", $._left_hand_side),
        "in",
        field("right", $._expressions),
        ":",
        field("body", $._suite),
        optional(field("alternative", $.else_clause)),
      ),

    while_statement: ($) =>
      seq(
        "while",
        field("condition", $.expression),
        ":",
        field("body", $._suite),
        optional(field("alternative", $.else_clause)),
      ),

    try_statement: ($) =>
      seq(
        "try",
        ":",
        field("body", $._suite),
        choice(
          seq(
            repeat1($.except_clause),
            optional($.else_clause),
            optional($.finally_clause),
          ),
          $.finally_clause,
        ),
      ),

    except_clause: ($) =>
      seq(
        "except",
        optional(
          seq($.expression, optional(seq(choice("as", ","), $.expression))),
        ),
        ":",
        $._suite,
      ),

    finally_clause: ($) => seq("finally", ":", $._suite),

    with_statement: ($) =>
      seq(
        optional("async"),
        optional($.comptime_modifier),
        "with",
        commaSep1($.with_item),
        ":",
        field("body", $._suite),
      ),

    mlir_region_statement: ($) =>
      seq(
        "__mlir_region",
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        field("parameters", optional($.parameters)),
        ":",
        field("body", $._suite),
      ),

    with_clause: ($) =>
      choice(
        seq(commaSep1($.with_item), optional(",")),
        seq("(", commaSep1($.with_item), optional(","), ")"),
      ),

    with_item: ($) =>
      prec.dynamic(
        1,
        seq(
          field("value", $.expression),
          optional(seq("as", field("alias", $.pattern))),
        ),
      ),

    // ====================
    // Simple Statements (basic implementations)
    // ====================

    import_statement: ($) => seq("import", $._import_list),

    import_prefix: ($) => repeat1("."),

    relative_import: ($) => seq($.import_prefix, optional($.dotted_name)),

    import_from_statement: ($) =>
      seq(
        "from",
        field("module_name", choice($.relative_import, $.dotted_name)),
        "import",
        choice(
          $.wildcard_import,
          $._import_list,
          seq("(", $._import_list, ")"),
        ),
      ),

    _import_list: ($) =>
      seq(
        commaSep1(field("name", choice($.dotted_name, $.relative_import, $.aliased_import))),
        optional(","),
      ),

    aliased_import: ($) =>
      seq(field("name", choice($.dotted_name, $.relative_import)), "as", field("alias", $.identifier)),

    wildcard_import: ($) => "*",

    assert_statement: ($) => seq("assert", commaSep1($.expression)),

    comptime_assert_statement: ($) =>
      seq(
        choice(
          seq("comptime", "assert"),
          "__comptime_assert",
        ),
        commaSep1($.expression),
      ),

    expression_statement: ($) =>
      choice(
        $.expression,
        seq(commaSep1($.expression), optional(",")),
        $.assignment,
        $.augmented_assignment,
      ),

    named_expression: ($) =>
      seq(
        field("name", $._named_expression_lhs),
        ":=",
        field("value", $.expression),
      ),

    _named_expression_lhs: ($) => choice($.identifier, $.keyword_identifier),

    return_statement: ($) => seq("return", optional($._expressions)),

    _expressions: ($) => choice($.expression, $.expression_list),

    raise_statement: ($) =>
      seq(
        "raise",
        optional($._expressions),
        optional(seq("from", field("cause", $.expression))),
      ),

    pass_statement: (_) => "pass",
    break_statement: (_) => "break",
    continue_statement: (_) => "continue",

    type_alias_statement: ($) =>
      prec.dynamic(1, seq("type", $.type, "=", $.type)),

    // ====================
    // Expressions
    // ====================

    expression: ($) =>
      choice(
        $.not_operator,
        $.boolean_operator,
        $.primary_expression,
        $.conditional_expression,
        $.named_expression,
      ),

    // NEW: Ownership transfer operator ^
    transfer_expression: ($) =>
      prec(PREC.transfer, seq(field("value", $.primary_expression), "^")),

    primary_expression: ($) =>
      choice(
        $.transfer_expression, // NEW: ownership transfer
        $.await,
        $.binary_operator,
        $.identifier,
        $.keyword_identifier,
        $.string,
        $.concatenated_string,
        $.integer,
        $.float,
        $.true,
        $.false,
        $.none,
        $.unary_operator,
        $.attribute,
        $.subscript,
        $.call,
        $.list,
        $.list_comprehension,
        $.dictionary,
        $.dictionary_comprehension,
        $.set,
        $.set_comprehension,
        $.tuple,
        $.parenthesized_expression,
        $.generator_expression,
        $.ellipsis,
        $.comparison_operator, // Keep here for precedence
        $.function_type,       // Supported as values/expressions for closures/lambda types
      ),

    not_operator: ($) =>
      prec(PREC.not, seq("not", field("argument", $.expression))),

    boolean_operator: ($) =>
      choice(
        prec.left(
          PREC.and,
          seq(
            field("left", $.expression),
            field("operator", "and"),
            field("right", $.expression),
          ),
        ),
        prec.left(
          PREC.or,
          seq(
            field("left", $.expression),
            field("operator", "or"),
            field("right", $.expression),
          ),
        ),
      ),

    binary_operator: ($) => {
      /** @type {Array<[any, number, string]>} */
      const table = [
        [prec.left, PREC.plus, "+"],
        [prec.left, PREC.plus, "-"],
        [prec.left, PREC.times, "*"],
        [prec.left, PREC.times, "@"],
        [prec.left, PREC.times, "/"],
        [prec.left, PREC.times, "%"],
        [prec.left, PREC.times, "//"],
        [prec.right, PREC.power, "**"],
        [prec.left, PREC.bitwise_or, "|"],
        [prec.left, PREC.bitwise_and, "&"],
        [prec.left, PREC.xor, "^"],
        [prec.left, PREC.shift, "<<"],
        [prec.left, PREC.shift, ">>"],
      ];

      return choice(
        ...table.map(([fn, precedence, operator]) =>
          fn(
            precedence,
            seq(
              field("left", $.primary_expression),
              // @ts-ignore
              field("operator", operator),
              field("right", $.primary_expression),
            ),
          ),
        ),
      );
    },

    unary_operator: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "~")),
          field("argument", $.primary_expression),
        ),
      ),

    comparison_operator: ($) =>
      prec.left(
        PREC.compare,
        seq(
          $.primary_expression,
          repeat1(
            seq(
              field(
                "operators",
                choice(
                  "<",
                  "<=",
                  "==",
                  "!=",
                  ">=",
                  ">",
                  "<>",
                  "in",
                  alias(seq("not", "in"), "not in"),
                  "is",
                  alias(seq("is", "not"), "is not"),
                ),
              ),
              $.primary_expression,
            ),
          ),
        ),
      ),

    assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        choice(
          seq("=", field("right", $._right_hand_side)),
          seq(":", field("type", $.type)),
          seq(
            ":",
            field("type", $.type),
            "=",
            field("right", $._right_hand_side),
          ),
        ),
      ),

    augmented_assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        field(
          "operator",
          choice(
            "+=",
            "-=",
            "*=",
            "/=",
            "@=",
            "//=",
            "%=",
            "**=",
            ">>=",
            "<<=",
            "&=",
            "^=",
            "|=",
          ),
        ),
        field("right", $._right_hand_side),
      ),

    _left_hand_side: ($) => choice($.pattern, $.pattern_list),

    pattern_list: ($) =>
      seq(
        $.pattern,
        choice(",", seq(repeat1(seq(",", $.pattern)), optional(","))),
      ),

    _right_hand_side: ($) =>
      choice(
        $.expression,
        $.expression_list,
        $.assignment,
        $.augmented_assignment,
        $.pattern_list,
        $.yield,
      ),

    yield: ($) =>
      prec.right(
        seq(
          "yield",
          choice(seq("from", $.expression), optional($._expressions)),
        ),
      ),

    attribute: ($) =>
      prec(
        PREC.call,
        seq(
          field("object", $.primary_expression),
          ".",
          field("attribute", choice($.identifier, $.string)),
        ),
      ),

    subscript: ($) =>
      prec(
        PREC.call,
        seq(
          field("value", $.primary_expression),
          "[",
          optional(
            seq(
              commaSep1(
                field(
                  "subscript",
                  choice($.expression, $.slice, $.keyword_argument, $.list_splat),
                ),
              ),
              optional(","),
            ),
          ),
          "]",
        ),
      ),

    slice: ($) =>
      seq(
        optional($.expression),
        ":",
        optional($.expression),
        optional(seq(":", optional($.expression))),
      ),

    call: ($) =>
      prec(
        PREC.call,
        seq(
          field("function", $.primary_expression),
          field("arguments", choice($.generator_expression, $.argument_list)),
        ),
      ),

    type: ($) =>
      choice(
        $.function_type,
        // Type with argument convention (e.g., ref[origin] Type)
        seq(field("convention", $.argument_convention), $.expression),
        // Variadic splat type (e.g., *Ts)
        $.list_splat,
        // Regular type expression
        $.expression,
      ),

    function_type: ($) =>
      prec.right(
        seq(
          field("keyword", choice("def", "fn")),
          optional(field("meta_parameters", $.meta_parameters)),
          field("parameters", $.function_type_parameters),
          optional(
            choice(
              seq(
                optional(seq("->", field("return_type", $.type))),
                repeat(field("modifiers", $.function_modifier)),
                optional(field("captures", $.capture_list)),
              ),
              seq(
                repeat1(field("modifiers", $.function_modifier)),
                optional(field("captures", $.capture_list)),
                optional(seq("->", field("return_type", $.type))),
              ),
              seq(
                field("captures", $.capture_list),
                optional(seq("->", field("return_type", $.type))),
              ),
            ),
          ),
        ),
      ),

    function_type_parameters: ($) =>
      seq("(", optional(seq(commaSep1(choice($.type, $.typed_parameter, $.positional_separator, $.keyword_separator, $.infer_separator)), optional(","))), ")"),

    // ====================
    // Literals and Patterns
    // ====================

    keyword_argument: ($) =>
      seq(
        field("name", choice($.identifier, $.keyword_identifier, $.string)),
        "=",
        field("value", choice($.expression, $.slice)),
      ),

    // Patterns (simplified)
    pattern: ($) =>
      choice(
        $.identifier,
        $.keyword_identifier,
        $.ref_pattern,
        $.var_pattern,
        $.subscript,
        $.attribute,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.list_pattern,
        $.call,
      ),

    ref_pattern: ($) =>
      prec(
        25,
        seq(
          "ref",
          optional(seq("[", field("origin", $.expression), "]")),
          field("pattern", $.pattern),
        ),
      ),

    var_pattern: ($) =>
      prec(
        25,
        seq(
          "var",
          field("pattern", $.pattern),
        ),
      ),

    tuple_pattern: ($) =>
      seq("(", optional(seq(commaSep1($.pattern), optional(","))), ")"),

    list_pattern: ($) =>
      seq("[", optional(seq(commaSep1($.pattern), optional(","))), "]"),


    // Complex literals
    list: ($) => seq("[", optional($._collection_elements), "]"),

    set: ($) => seq("{", $._collection_elements, "}"),

    tuple: ($) => seq("(", optional($._collection_elements), ")"),

    dictionary: ($) =>
      seq(
        "{",
        optional(commaSep1(choice($.pair, $.dictionary_splat))),
        optional(","),
        "}",
      ),

    pair: ($) =>
      seq(field("key", $.expression), choice(":", "="), field("value", $.expression)),

    list_comprehension: ($) =>
      seq("[", field("body", $.expression), $._comprehension_clauses, "]"),

    dictionary_comprehension: ($) =>
      seq("{", field("body", $.pair), $._comprehension_clauses, "}"),

    set_comprehension: ($) =>
      seq("{", field("body", $.expression), $._comprehension_clauses, "}"),

    generator_expression: ($) =>
      seq("(", field("body", $.expression), $._comprehension_clauses, ")"),

    _comprehension_clauses: ($) =>
      seq($.for_in_clause, repeat(choice($.for_in_clause, $.if_clause))),

    parenthesized_expression: ($) =>
      prec(
        PREC.parenthesized_expression,
        seq("(", choice($.expression, $.yield), ")"),
      ),

    _collection_elements: ($) =>
      seq(
        commaSep1(
          choice(
            $.expression,
            $.yield,
            $.list_splat,
            $.parenthesized_list_splat,
            $.keyword_argument,
          ),
        ),
        optional(","),
      ),

    for_in_clause: ($) =>
      prec.left(
        seq(
          "for",
          field("left", $._left_hand_side),
          "in",
          field("right", commaSep1($._expression_within_for_in_clause)),
          optional(","),
        ),
      ),

    if_clause: ($) => seq("if", $.expression),

    _expression_within_for_in_clause: ($) => choice($.expression),

    conditional_expression: ($) =>
      prec.right(
        PREC.conditional,
        seq($.expression, "if", $.expression, "else", $.expression),
      ),

    concatenated_string: ($) => seq($.string, repeat1($.string)),

    string: ($) =>
      seq(
        $.string_start,
        repeat(choice($.interpolation, $._string_content, $.escape_sequence)),
        $.string_end,
      ),

    interpolation: ($) =>
      seq(
        "{",
        field("expression", $._f_expression),
        optional("="),
        optional(field("type_conversion", $.type_conversion)),
        optional(field("format_specifier", $.format_specifier)),
        "}",
      ),

    _f_expression: ($) =>
      choice($.expression, $.expression_list, $.pattern_list, $.yield),

    escape_sequence: (_) =>
      token.immediate(
        prec(
          1,
          seq(
            "\\",
            choice(
              /u[a-fA-F\d]{4}/,
              /U[a-fA-F\d]{8}/,
              /x[a-fA-F\d]{2}/,
              /\d+/,
              /\r?\n/,
              /['"abfrntv\\0]/,
              /N\{[^}]+\}/,
            ),
          ),
        ),
      ),

    _not_escape_sequence: (_) => token.immediate("\\"),

    format_specifier: ($) =>
      seq(
        ":",
        repeat(
          choice(
            token(prec(1, /[^{}\n]+/)),
            alias($.interpolation, $.format_expression),
          ),
        ),
      ),

    type_conversion: (_) => /![sra]/,

    integer: (_) =>
      token(
        choice(
          seq(choice("0x", "0X"), /[A-Fa-f0-9]+(_+[A-Fa-f0-9]+)*/, optional(/[Ll]/)),
          seq(choice("0o", "0O"), /[0-7]+(_+[0-7]+)*/, optional(/[Ll]/)),
          seq(choice("0b", "0B"), /[0-1]+(_+[0-1]+)*/, optional(/[Ll]/)),
          seq(
            /[0-9]+(_+[0-9]+)*/,
            choice(
              optional(/[Ll]/), // long numbers
              optional(/[jJ]/), // complex numbers
            ),
          ),
        ),
      ),

    float: (_) => {
      const digits = /[0-9]+(_+[0-9]+)*/;
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(
        seq(
          choice(
            seq(digits, ".", optional(digits), optional(exponent)),
            seq(optional(digits), ".", digits, optional(exponent)),
            seq(digits, exponent),
          ),
          optional(choice(/[Ll]/, /[jJ]/)),
        ),
      );
    },

    identifier: (_) => token(choice(/[_\p{XID_Start}][\p{XID_Continue}]*/u, /`[^`\r\n]+`/)),

    keyword_identifier: ($) =>
      prec(
        -3,
        alias(choice("print", "async", "await", "match"), $.identifier),
      ),

    soft_keyword_identifier: ($) =>
      prec(
        -3,
        alias(
          choice("read", "mut", "var", "out", "deinit", "ref"),
          $.identifier,
        ),
      ),

    true: (_) => "True",
    false: (_) => "False",
    none: (_) => "None",

    await: ($) => prec(PREC.unary, seq("await", $.primary_expression)),

    comment: (_) => token(seq("#", /.*/)),

    line_continuation: (_) =>
      token(seq("\\", choice(seq(optional("\r"), "\n"), "\0"))),

    positional_separator: (_) => "/",
    keyword_separator: (_) => "*",
    infer_separator: (_) => "//",

    // Additional helpers

    expression_list: ($) =>
      prec.right(
        seq(
          $.expression,
          choice(",", seq(repeat1(seq(",", $.expression)), optional(","))),
        ),
      ),

    dotted_name: ($) => sep1($.identifier, "."),

    _suite: ($) =>
      choice(
        alias($._simple_statements, $.block),
        seq($._indent, repeat($._statement), $._dedent),
        alias($._newline, $.block),
      ),

    list_splat: ($) => seq("*", $.expression),

    dictionary_splat: ($) => seq("**", $.expression),

    parenthesized_list_splat: ($) =>
      prec(
        PREC.parenthesized_list_splat,
        seq(
          "(",
          choice(
            alias($.parenthesized_list_splat, $.parenthesized_expression),
            $.list_splat,
          ),
          ")",
        ),
      ),

    argument_list: ($) =>
      seq(
        "(",
        optional(
          commaSep1(
            choice(
              $.expression,
              $.list_splat,
              $.dictionary_splat,
              alias($.parenthesized_list_splat, $.parenthesized_expression),
              $.keyword_argument,
            ),
          ),
        ),
        optional(","),
        ")",
      ),

    keyword: (_) =>
      choice(
        "and",
        "as",
        "assert",
        "__comptime_assert",
        "async",
        "await",
        "break",
        "comptime", // NEW
        "continue",
        "def",
        "del",
        "elif",
        "else",
        "except",
        "finally",
        "fn", // NEW
        "for",
        "from",
        "if",
        "import",
        "in",
        "is",
        "not",
        "or",
        "pass",
        "print",
        "raise",
        "ref", // NEW
        "return",
        "struct", // NEW
        "thin",
        "trait", // NEW
        "try",
        "where", // NEW
        "while",
        "with",
        "yield",
        "match",
        "case",
        "type",
      ),

    ellipsis: (_) => "...",

    _trait_suite: ($) =>
      choice(
        alias($._trait_simple_statements, $.block),
        seq($._indent, repeat($._trait_statement), $._dedent),
        alias($._newline, $.block),
      ),

    _trait_statement: ($) => choice($._trait_simple_statements, $._compound_statement),

    _trait_simple_statements: ($) =>
      seq(
        sep1($._trait_simple_statement, SEMICOLON),
        optional(SEMICOLON),
        $._newline,
      ),

    _trait_simple_statement: ($) =>
      choice(
        $.import_statement,
        $.import_from_statement,
        $.assert_statement,
        $.expression_statement,
        $.return_statement,
        $.raise_statement,
        $.pass_statement,
        $.break_statement,
        $.continue_statement,
        $.type_alias_statement,
        $.comptime_member_declaration,
        $.comptime_assert_statement,
      ),
  },
});

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 *
 */
function commaSep1(rule) {
  return sep1(rule, ",");
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {ChoiceRule}
 *
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {Rule} rule
 *
 * @param {string} separator
 *
 * @return {SeqRule}
 *
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

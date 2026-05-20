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
    [$.named_expression, $.as_pattern],
    [$.type_alias_statement, $.primary_expression],
    [$.match_statement, $.primary_expression],
    // NEW: Mojo-specific conflicts
    [$.parameter, $.typed_parameter],
    [$.subscript, $.meta_parameters],
    [$.list_splat_pattern, $.splat_pattern],
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
        $.ref_binding, // NEW: Mojo ref binding
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
        $.class_definition,
        $.decorated_definition,
        $.match_statement,
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
              field("captures", $.capture_list),
              optional(seq("->", field("return_type", $.type))),
            ),
          ),
        ),
        ":",
        field("body", $._suite),
      ),

    // NEW: Meta parameters for compile-time generics [T: Type, N: Int]
    meta_parameters: ($) =>
      seq("[", optional(seq(commaSep1($.meta_parameter), optional(","))), "]"),

    meta_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        ":",
        field("type", $.type),
        optional(seq("=", field("default", $.expression))),
      ),

    // Function effects supported by recent Mojo releases plus legacy capturing.
    function_modifier: ($) =>
      choice("raises", "thin", "capturing", $.abi_effect),

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
        $.dictionary_splat_pattern,
      ),

    typed_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        seq(
          optional(field("convention", $.argument_convention)), // NEW: mut, var, etc.
          field("name", choice($.identifier, $.soft_keyword_identifier)),
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
        seq("ref", "[", field("origin", $.expression), "]"),
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

    keyword_separator: ($) => "*",
    positional_separator: ($) => "/",

    // ====================
    // MOJO: Class/Struct/Trait Definition
    // ====================

    class_definition: ($) =>
      seq(
        field("keyword", choice("class", "struct", "trait")), // NEW: struct, trait
        field("name", $.identifier),
        optional(field("meta_parameters", $.meta_parameters)), // NEW: generic params
        optional(field("superclasses", $.argument_list)),
        ":",
        field("body", $._suite),
      ),

    // ====================
    // MOJO: Compile-time Declaration
    // ====================

    comptime_declaration: ($) =>
      seq(
        "comptime",
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        optional(seq("[", commaSep1($.meta_parameter), "]")),
        "=",
        field("value", $.expression),
      ),

    // ====================
    // MOJO: Reference Binding
    // ====================

    ref_binding: ($) =>
      seq(
        "ref",
        field("name", choice($.identifier, $.soft_keyword_identifier)),
        "=",
        field("value", $.expression),
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
            $.class_definition,
            $.function_definition,
            $.if_statement,
            $.for_statement,
          ),
        ),
      ),

    decorator: ($) => seq("@", $.expression, $._newline),

    _suite: ($) =>
      choice(
        alias($._simple_statements, $.block),
        seq($._indent, repeat1($._statement)),
        alias($._newline, $.block),
      ),

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

    match_statement: ($) =>
      seq(
        "match",
        commaSep1(field("subject", $.expression)),
        ":",
        field("body", alias($._match_block, $.block)),
      ),

    _match_block: ($) =>
      choice(
        seq($._indent, repeat(field("alternative", $.case_clause)), $._dedent),
        $._newline,
      ),

    case_clause: ($) =>
      seq(
        "case",
        commaSep1(field("pattern", $.case_pattern)),
        optional(field("guard", $.if_clause)),
        ":",
        field("consequence", $._suite),
      ),

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

    with_clause: ($) =>
      choice(
        seq(commaSep1($.with_item), optional(",")),
        seq("(", commaSep1($.with_item), optional(","), ")"),
      ),

    with_item: ($) => prec.dynamic(1, seq(field("value", $.expression))),

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
        commaSep1(field("name", choice($.dotted_name, $.aliased_import))),
        optional(","),
      ),

    aliased_import: ($) =>
      seq(field("name", $.dotted_name), "as", field("alias", $.identifier)),

    wildcard_import: ($) => "*",

    assert_statement: ($) => seq("assert", commaSep1($.expression)),

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
        $.as_pattern,
        $.transfer_expression, // NEW: ownership transfer
      ),

    // NEW: Ownership transfer operator ^
    transfer_expression: ($) =>
      prec(PREC.transfer, seq(field("value", $.primary_expression), "^")),

    primary_expression: ($) =>
      choice(
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
        optional("var"), // NEW: optional var keyword
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
          field("attribute", $.identifier),
        ),
      ),

    subscript: ($) =>
      prec(
        PREC.call,
        seq(
          field("value", $.primary_expression),
          "[",
          commaSep1(
            field(
              "subscript",
              choice($.expression, $.slice, $.keyword_argument),
            ),
          ),
          optional(","),
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
        // Regular type expression
        $.expression,
      ),

    function_type: ($) =>
      prec.right(
        seq(
          field("keyword", choice("def", "fn")),
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
      seq("(", optional(seq(commaSep1($.type), optional(","))), ")"),

    // ====================
    // Literals and Patterns
    // ====================

    keyword_argument: ($) =>
      seq(
        field("name", choice($.identifier, $.keyword_identifier)),
        "=",
        field("value", $.expression),
      ),

    // Patterns (simplified)
    pattern: ($) =>
      choice(
        $.identifier,
        $.keyword_identifier,
        $.subscript,
        $.attribute,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.list_pattern,
      ),

    tuple_pattern: ($) =>
      seq("(", optional(seq(commaSep1($.pattern), optional(","))), ")"),

    list_pattern: ($) =>
      seq("[", optional(seq(commaSep1($.pattern), optional(","))), "]"),

    case_pattern: ($) =>
      prec(
        1,
        choice(
          alias($._as_pattern, $.as_pattern),
          $.keyword_pattern,
          $.splat_pattern,
          alias($._complex_pattern, $.union_pattern),
          alias($._simple_pattern, $.case_pattern),
        ),
      ),

    _simple_pattern: ($) =>
      prec(
        1,
        choice(
          $.class_pattern,
          $.splat_pattern,
          $.union_pattern,
          alias($.list_splat_pattern, $.splat_pattern),
          $.primary_expression,
          $.list_pattern,
          $.tuple_pattern,
          $.dict_pattern,
        ),
      ),

    _as_pattern: ($) =>
      prec.left(
        seq(
          $.case_pattern,
          "as",
          field("alias", alias($.expression, $.as_pattern_target)),
        ),
      ),

    union_pattern: ($) =>
      prec.left(seq($.case_pattern, repeat1(seq("|", $.case_pattern)))),

    _complex_pattern: ($) =>
      prec.left(
        seq(
          choice(
            $.class_pattern,
            $.primary_expression,
            alias($._list_pattern, $.list_pattern),
            alias($._tuple_pattern, $.tuple_pattern),
            $.dict_pattern,
            $.keyword_pattern,
            $.splat_pattern,
            alias($.list_splat_pattern, $.splat_pattern),
          ),
          repeat1(
            seq(
              "|",
              choice(
                $.class_pattern,
                $.primary_expression,
                alias($._list_pattern, $.list_pattern),
                alias($._tuple_pattern, $.tuple_pattern),
                $.dict_pattern,
                $.keyword_pattern,
                $.splat_pattern,
                alias($.list_splat_pattern, $.splat_pattern),
              ),
            ),
          ),
        ),
      ),

    _list_pattern: ($) =>
      seq("[", optional(seq(commaSep1($.case_pattern), optional(","))), "]"),

    _tuple_pattern: ($) =>
      seq("(", optional(seq(commaSep1($.case_pattern), optional(","))), ")"),

    dict_pattern: ($) =>
      seq(
        "{",
        optional(
          seq(
            commaSep1(choice($._key_value_pattern, $.splat_pattern)),
            optional(","),
          ),
        ),
        "}",
      ),

    _key_value_pattern: ($) =>
      seq(
        field("key", choice($.primary_expression, $.keyword)),
        ":",
        field("value", $.case_pattern),
      ),

    keyword_pattern: ($) =>
      seq(
        field("name", choice($.identifier, $.keyword_identifier)),
        "=",
        field("value", $.case_pattern),
      ),

    splat_pattern: ($) => seq("*", choice($.identifier, $.keyword_identifier)),

    class_pattern: ($) =>
      seq(
        $.primary_expression,
        "(",
        optional(seq(commaSep1($.case_pattern), optional(","))),
        ")",
      ),

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
      seq(field("key", $.expression), ":", field("value", $.expression)),

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

    _expression_within_for_in_clause: ($) =>
      choice($.expression),

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
              /\d{3}/,
              /\r?\n/,
              /['"abfrntv\\]/,
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
          seq(choice("0x", "0X"), repeat1(/_?[A-Fa-f0-9]+/), optional(/[Ll]/)),
          seq(choice("0o", "0O"), repeat1(/_?[0-7]+/), optional(/[Ll]/)),
          seq(choice("0b", "0B"), repeat1(/_?[0-1]+/), optional(/[Ll]/)),
          seq(
            repeat1(/[0-9]+_?/),
            choice(
              optional(/[Ll]/), // long numbers
              optional(/[jJ]/), // complex numbers
            ),
          ),
        ),
      ),

    float: (_) => {
      const digits = repeat1(/[0-9]+_?/);
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

    identifier: (_) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    keyword_identifier: ($) =>
      prec(
        -3,
        alias(choice("print", "exec", "async", "await", "match"), $.identifier),
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

    // Additional helpers
    as_pattern: ($) =>
      prec.left(seq($.expression, "as", field("alias", $.expression))),

    expression_list: ($) =>
      prec.right(
        seq(
          $.expression,
          choice(",", seq(repeat1(seq(",", $.expression)), optional(","))),
        ),
      ),

    dotted_name: ($) => sep1($.identifier, "."),

    // Match statement helpers
    case_pattern: ($) => choice($.pattern, $.splat_pattern),

    _suite: ($) =>
      choice(
        alias($._simple_statements, $.block),
        seq($._indent, repeat($._statement), $._dedent),
        alias($._newline, $.block),
      ),

    _parameters: ($) => seq(commaSep1($.parameter), optional(",")),

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
        "async",
        "await",
        "break",
        "class",
        "comptime", // NEW
        "continue",
        "def",
        "del",
        "elif",
        "else",
        "except",
        "exec",
        "finally",
        "fn", // NEW
        "for",
        "from",
        "global",
        "if",
        "import",
        "in",
        "is",
        "nonlocal",
        "not",
        "or",
        "pass",
        "print",
        "raise",
        "return",
        "struct", // NEW
        "thin",
        "trait", // NEW
        "try",
        "while",
        "with",
        "yield",
        "match",
        "case",
        "type",
      ),

    ellipsis: (_) => "...",
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

def test_escaped_identifiers() raises:
    var `struct` = 10  # Use a keyword as a name
    var `日本語の変数` = 20  # Non-ASCII identifier
    var `my value` = 30  # Spaces in a name
    assert_equal(`struct`, 10)
    assert_equal(`日本語の変数`, 20)
    assert_equal(`my value`, 30)

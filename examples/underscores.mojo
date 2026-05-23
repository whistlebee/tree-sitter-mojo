def test_integer_underscores() raises:
    assert_equal(1_000_000, 1000000)
    var x = 1__000
    assert_equal(x, 1000)

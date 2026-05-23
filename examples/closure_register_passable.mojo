def test_closure_register_passable() raises:
    var base = 10
    def shift(x: Int) register_passable {var base} -> Int:
        return x + base

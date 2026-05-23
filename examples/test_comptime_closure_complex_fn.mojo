@parameter
def bench_math[
    math_f1p: def[dtype: DType, size: Int](SIMD[dtype, size]) thin -> SIMD[
        dtype, size
    ]
](mut b: Bencher) raises:
    var inputs = make_inputs(0, 10_000, 1_000_000)

    @always_inline
    @parameter
    def call_fn() raises:
        for input in inputs:
            var result = math_f1p(input)
            keep(result)

    b.iter[call_fn]()

    _ = inputs^

# SIMD and compile-time programming example
# Demonstrates: SIMD values, compile-time parameters, and reusable generic kernels

def add_vectors[N: Int](
    left: SIMD[DType.float32, N],
    right: SIMD[DType.float32, N]
) -> SIMD[DType.float32, N]:
    return left + right


def scale_vector[N: Int](
    values: SIMD[DType.float32, N],
    factor: Float32
) -> SIMD[DType.float32, N]:
    return values * SIMD[DType.float32, N](factor)


def main():
    comptime width = 4

    var left = SIMD[DType.float32, width](1.0, 2.0, 3.0, 4.0)
    var right = SIMD[DType.float32, width](10.0)
    var summed = add_vectors[width](left, right)
    var scaled = scale_vector[width](summed, 0.5)

    print(summed)
    print(scaled)

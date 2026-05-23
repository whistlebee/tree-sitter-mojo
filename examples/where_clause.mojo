def process[
    n: Int,
](data: SIMD[DType.float32, n]) -> Float32 where (
    n == 1 or n == 2 or n == 4 or n == 8 or n == 16 or n == 32
):
    var sum: Float32 = 0.0
    for i in range(n):
        sum += data[i]
    return sum

def reduce_simd[simd_width: Int](a: DTypePointer[DType.float32], size: Int) -> Float32:
    var result: Float32 = 0.0
    
    comptime for i in range(0, size - size % simd_width, simd_width):
        var simd_a = (a.unsafe_ptr() + i).load[width=simd_width]()
        result += (simd_a * simd_a).reduce_add()
        
    return result

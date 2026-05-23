def kl_div[
    dtype: DType, //, out_type: DType = DType.float64
](
    x: UnsafePointer[Scalar[dtype], ImmutAnyOrigin],
    y: type_of(x),
    len: Int,
) -> Scalar[
    out_type
] where dtype.is_floating_point() where out_type.is_floating_point():
    pass

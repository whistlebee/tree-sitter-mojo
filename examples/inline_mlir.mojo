def main():
    var a: __mlir_type.index = __mlir_attr.`42 : index`
    var b: __mlir_type.index = __mlir_attr.`8 : index`
    var c = __mlir_op.`index.add`(a, b)
    print(Int(mlir_value=c))  # 50

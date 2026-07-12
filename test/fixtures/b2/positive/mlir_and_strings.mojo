def main():
    var left: __mlir_type.index = __mlir_attr.`40 : index`
    var right: __mlir_type.index = __mlir_attr.`2 : index`
    var total = __mlir_op.`index.add`(left, right)
    comptime label = "MLIR result"
    print(t"{label}: {Int(mlir_value=total)}")

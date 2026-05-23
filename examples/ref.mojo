fn test_ref_argument_convention(ref x: Int):
    pass

fn test_ref_with_origin_argument_convention(ref [self] self) -> ref [self] Int:
    return self.val

fn test_ref_variable_bindings(x: Int):
    ref y = x
    ref [f] z = f.val
    
    for ref item in list:
        pass

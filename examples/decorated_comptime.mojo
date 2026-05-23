struct MyStruct:
    @doc_hidden
    comptime NicheStorage: NicheStorageTraits = _UnsafePointerNicheStorage[
        Self.type, Self.address_space
    ]

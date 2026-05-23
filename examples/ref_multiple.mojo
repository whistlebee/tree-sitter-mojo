struct InlineArray[ElementType: Copyable, size: Int]:
    def unsafe_ptr[origin: Origin, address_space: AddressSpace](ref[origin, address_space] self) -> UnsafePointer[ElementType, origin, address_space=address_space]:
        pass

__extension MyType:
    def method(self):
        pass

@decorator
__extension MyGenericType[T]:
    def another_method(self):
        pass

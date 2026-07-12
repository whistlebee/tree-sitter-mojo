trait HasValue:
    def get(self) -> Int:
        ...


struct Value(HasValue):
    var storage: Int

    def __init__(out self, storage: Int):
        self.storage = storage

    def get(self) -> Int:
        return self.storage


def main():
    var value = Value(42)
    print(value.get())

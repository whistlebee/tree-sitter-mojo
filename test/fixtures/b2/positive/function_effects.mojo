def call_callback(callback: def(Int) thin -> Int, value: Int) -> Int:
    return callback(value)


def checked(value: Int) raises -> Int:
    if value < 0:
        raise Error("negative value")
    return value


def main() raises:
    def add_one(value: Int) {} -> Int:
        return value + 1

    var callback: def(Int) thin -> Int = add_one
    print(checked(call_callback(callback, 40)))

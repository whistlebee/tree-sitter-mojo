# Mojo v1.0.0b1 function-effect examples
# Demonstrates: local unified closures, thin function pointers, and abi("C")

def call_callback(callback: def(Int) thin -> Int, value: Int) -> Int:
    return callback(value)


def exported_add(a: Int32, b: Int32) abi("C") -> Int32:
    return a + b


def main():
    var counter = 10

    def add_one(value: Int) {} -> Int:
        return value + 1

    def next_count() {mut counter} -> Int:
        counter += 1
        return counter

    var fn_ptr: def(Int) thin -> Int = add_one

    print(next_count())
    print(call_callback(fn_ptr, 41))
    print(exported_add(20, 22))

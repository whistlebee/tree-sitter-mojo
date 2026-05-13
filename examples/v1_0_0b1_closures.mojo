# Mojo v1.0.0b1 closure examples
# Demonstrates: empty capture lists, default captures, ref captures, and raises with captures

def main() raises:
    var prefix = String("Hello")
    var total = 10
    var delta = 5

    def greet(name: String) {}:
        print("Hi,", name)

    def show_prefix() {ref prefix}:
        print(prefix)

    def apply() {mut total, delta, read} -> Int:
        total += delta
        return total

    def fallible_divide(numerator: Float64, denominator: Float64) raises {} -> Float64:
        if denominator == 0:
            raise Error("division by zero")
        return numerator / denominator

    greet(String("Mojo"))
    show_prefix()
    print(apply())

    try:
        print(fallible_divide(9.0, 3.0))
        _ = fallible_divide(1.0, 0.0)
    except e:
        print(e)

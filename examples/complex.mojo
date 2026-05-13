def process[T: Copyable & ImplicitlyDestructible, N: Int](var data: T, buffer: String) raises -> T:
    if N < 1:
        raise Error("N must be positive")
    print(buffer)
    return data^


def main() raises:
    print(process[Int, 4](42, String("processing")))

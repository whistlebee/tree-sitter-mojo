comptime WIDTH = 4
comptime Scalar = Int


def add_width(value: Scalar) -> Scalar:
    return value + WIDTH


def main():
    print(add_width(38))

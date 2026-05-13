# Simple Mojo test
def hello():
    print("Hello, Mojo!")

struct Point:
    var x: Int
    var y: Int

    def __init__(out self, x: Int, y: Int):
        self.x = x
        self.y = y

def python_style():
    pass


def main():
    hello()
    var point = Point(3, 4)
    print(point.x + point.y)

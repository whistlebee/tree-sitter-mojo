struct Counter:
    var value: Int

    def __init__(out self, value: Int):
        self.value = value

    def increment(mut self):
        self.value += 1

    def current(ref self) -> Int:
        return self.value


def consume(var text: String):
    print(text)


def main():
    var counter = Counter(40)
    counter.increment()
    var message = String("owned")
    consume(message^)
    print(counter.current())

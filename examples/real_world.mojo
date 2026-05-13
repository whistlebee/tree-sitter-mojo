# Real-world Mojo example: task dashboard with traits and generic helpers
# Demonstrates: structs, traits, methods, strings, and generic ownership

trait Renderable:
    def render(self):
        ...


struct Task(Renderable):
    var title: String
    var done: Bool

    def __init__(out self, title: String, done: Bool):
        self.title = title
        self.done = done

    def render(self):
        print(self.title, "-", self.done)

    def toggle(mut self):
        self.done = not self.done


def duplicate_value[T: Copyable & ImplicitlyDestructible](var value: T) -> T:
    return value^


def main():
    var task = Task(String("Ship Mojo beta support"), False)
    task.render()
    task.toggle()
    task.render()
    print(duplicate_value[Int](42))

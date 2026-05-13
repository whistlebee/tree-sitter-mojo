# String builder with ownership semantics
# Demonstrates: struct with methods, ownership transfer, error handling

struct StringBuilder:
    """Efficiently build strings with ownership."""
    var buffer: String
    var length: Int
    
    def __init__(out self):
        """Create empty string builder."""
        self.buffer = String("")
        self.length = 0
    
    def __init__(out self, initial: String):
        """Create with initial string."""
        self.buffer = initial
        self.length = initial.byte_length()
    
    def append(mut self, var text: String):
        """Append text to buffer."""
        self.buffer = self.buffer + text
        self.length = self.buffer.byte_length()
    
    def append_number(mut self, num: Int):
        """Append a number."""
        self.buffer = self.buffer + String(num)
        self.length = self.buffer.byte_length()
    
    def clear(mut self):
        """Clear the buffer."""
        self.buffer = String("")
        self.length = 0
    
    def build(self) -> String:
        """Build final string."""
        return self.buffer


def format_message(name: String, age: Int) -> String:
    """Format a message using StringBuilder."""
    var sb = StringBuilder()
    sb.append(String("Hello, "))
    sb.append(name)
    sb.append(String("! You are "))
    sb.append_number(age)
    sb.append(String(" years old."))
    return sb.build()


def process_strings() raises:
    """Demonstrate string operations with ownership."""
    var greeting = String("Welcome")
    var exclamation = String("!")
    print(greeting + exclamation)
    
    # Build complex string
    var message = format_message(String("Alice"), 30)
    print(message)


def main() raises:
    process_strings()

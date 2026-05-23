struct Deque[ElementType: Copyable](
    Equatable where conforms_to(ElementType, Equatable),
    Writable where conforms_to(ElementType, Writable),
):
    pass

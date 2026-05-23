struct _FormatUtils:
    # TODO: Allow a way to provide a `comptime _PrecompiledEntries` to avoid
    # allocations in the `_PrecompiledEntries` struct.
    @staticmethod
    def format_precompiled[
        *Ts: Writable,
    ](
        mut writer: Some[Writer],
        compiled: _PrecompiledEntries[*Ts],
        *args: *Ts,
    ):
        """Format the arguments using the given format string and precompiled entries.
        """
        var offset = 0
        var ptr = compiled.format.unsafe_ptr()

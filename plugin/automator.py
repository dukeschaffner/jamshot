import subprocess
import re


PROBE_SCRIPT = """
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        set output to ""
        
        -- Get all windows
        set wins to every window
        repeat with w in wins
            set wName to name of w
            set output to output & "WINDOW: " & wName & "\\n"
            
            -- Look through toolbars
            try
                set tbars to every toolbar of w
                repeat with tb in tbars
                    set output to output & "  TOOLBAR\\n"
                    
                    -- Look through groups in toolbar
                    try
                        set grps to every group of tb
                        repeat with g in grps
                            set output to output & "    GROUP\\n"
                            
                            -- Look for text fields (tempo is usually a text field or static text)
                            try
                                set txts to every text field of g
                                repeat with t in txts
                                    set tVal to value of t
                                    set tDesc to description of t
                                    set output to output & "      TEXT_FIELD desc=" & tDesc & " val=" & tVal & "\\n"
                                end repeat
                            end try
                            
                            try
                                set stxts to every static text of g
                                repeat with st in stxts
                                    set stVal to value of st
                                    set output to output & "      STATIC_TEXT val=" & stVal & "\\n"
                                end repeat
                            end try
                            
                            -- Nested groups
                            try
                                set subgrps to every group of g
                                repeat with sg in subgrps
                                    set output to output & "      SUBGROUP\\n"
                                    try
                                        set txts2 to every text field of sg
                                        repeat with t2 in txts2
                                            set t2Val to value of t2
                                            set t2Desc to description of t2
                                            set output to output & "        TEXT_FIELD desc=" & t2Desc & " val=" & t2Val & "\\n"
                                        end repeat
                                    end try
                                    try
                                        set stxts2 to every static text of sg
                                        repeat with st2 in stxts2
                                            set st2Val to value of st2
                                            set output to output & "        STATIC_TEXT val=" & st2Val & "\\n"
                                        end repeat
                                    end try
                                end repeat
                            end try
                        end repeat
                    end try
                end repeat
            end try
        end repeat
        
        return output
    end tell
end tell
"""


def probe_logic_ui():
    """Probe Logic Pro's UI to find the tempo field and return its path info."""
    print("Probing Logic Pro UI hierarchy...")
    print("Make sure Logic Pro is open with a project loaded.\n")

    result = subprocess.run(
        ["osascript", "-e", PROBE_SCRIPT],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"Error probing Logic UI:\n{result.stderr}")
        print("\nMake sure:")
        print("  1. Logic Pro is open with a project loaded")
        print("  2. Your terminal/app has Accessibility permissions")
        print("     (System Settings > Privacy & Security > Accessibility)")
        return None

    output = result.stdout
    print("Raw UI hierarchy:\n")
    print(output)

    # Try to find a text field whose value looks like a BPM (e.g. "120.0000" or "120")
    bpm_pattern = re.compile(r'TEXT_FIELD desc=(.*?) val=(\d{2,3}\.?\d*)')
    matches = bpm_pattern.findall(output)

    if matches:
        print("\nPotential tempo fields found:")
        for desc, val in matches:
            print(f"  description='{desc}', value='{val}'")
        return matches
    else:
        print("\nNo obvious tempo field found in text fields.")
        print("The tempo may be displayed as a static text or a different element type.")
        print("Check the raw hierarchy above to identify it manually.")
        return None


def set_logic_bpm(bpm: float, tempo_field_description: str = None):
    """
    Set Logic Pro's tempo to the given BPM.

    If tempo_field_description is provided, targets that specific field.
    Otherwise uses a best-effort approach of clicking the tempo display area.
    """
    bpm_str = f"{bpm:.4f}" if isinstance(bpm, float) else str(bpm)

    if tempo_field_description:
        # Target by description found during probe
        script = f"""
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        set targetField to first text field of (first group of (first toolbar of (first window whose name is not ""))) whose description is "{tempo_field_description}"
        set focused of targetField to true
        set value of targetField to "{bpm_str}"
        key code 36
    end tell
end tell
"""
    else:
        # Fallback: click into the tempo area by coordinates (less reliable)
        script = f"""
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        -- Try setting value on any text field that looks like a tempo
        set wins to every window
        repeat with w in wins
            try
                set tbars to every toolbar of w
                repeat with tb in tbars
                    set grps to every group of tb
                    repeat with g in grps
                        set txts to every text field of g
                        repeat with t in txts
                            set tVal to value of t
                            -- BPM values are typically 2-3 digits, possibly with decimals
                            if tVal matches "\\\\d{{2,3}}(\\\\.\\\\d+)?" then
                                set focused of t to true
                                set value of t to "{bpm_str}"
                                key code 36
                                return "success"
                            end if
                        end repeat
                    end repeat
                end repeat
            end try
        end repeat
        return "tempo field not found"
    end tell
end tell
"""

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to set BPM.\n"
            f"AppleScript error: {result.stderr.strip()}\n\n"
            f"Try running probe_logic_ui() first to find the correct field."
        )

    output = result.stdout.strip()
    if output == "tempo field not found":
        raise RuntimeError(
            "Could not locate the tempo field automatically.\n"
            "Run probe_logic_ui() to inspect the UI hierarchy and pass the "
            "tempo field's description to set_logic_bpm()."
        )

    print(f"BPM set to {bpm}")


if __name__ == "__main__":
    # Step 1: Probe to find the tempo field
    matches = probe_logic_ui()

    if matches:
        # Step 2: Use the first match's description to set BPM
        tempo_desc = matches[0][0]
        print(f"\nUsing tempo field with description: '{tempo_desc}'")

        target_bpm = 128.0
        print(f"Setting BPM to {target_bpm}...")
        set_logic_bpm(target_bpm, tempo_field_description=tempo_desc)
    else:
        # Fallback: try without a specific path
        print("\nFalling back to auto-detection...")
        set_logic_bpm(128.0)
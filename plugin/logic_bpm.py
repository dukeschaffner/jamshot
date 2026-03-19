import subprocess
import re


PROBE_SCRIPT = """
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        set output to ""
        
        set wins to every window
        repeat with w in wins
            set wName to name of w
            set output to output & "WINDOW: " & wName & "\\n"
            
            try
                set tbars to every toolbar of w
                repeat with tb in tbars
                    set output to output & "  TOOLBAR\\n"
                    try
                        set grps to every group of tb
                        repeat with grp in grps
                            set output to output & "    GROUP\\n"
                            
                            try
                                set txts to every text field of grp
                                repeat with tf in txts
                                    set tfVal to value of tf
                                    set tfDesc to description of tf
                                    set output to output & "      TEXT_FIELD desc=" & tfDesc & " val=" & tfVal & "\\n"
                                end repeat
                            end try
                            
                            try
                                set stxts to every static text of grp
                                repeat with stxt in stxts
                                    set stxtVal to value of stxt
                                    set output to output & "      STATIC_TEXT val=" & stxtVal & "\\n"
                                end repeat
                            end try
                            
                            try
                                set subgrps to every group of grp
                                repeat with sgrp in subgrps
                                    set output to output & "      SUBGROUP\\n"
                                    try
                                        set txts2 to every text field of sgrp
                                        repeat with tf2 in txts2
                                            set tf2Val to value of tf2
                                            set tf2Desc to description of tf2
                                            set output to output & "        TEXT_FIELD desc=" & tf2Desc & " val=" & tf2Val & "\\n"
                                        end repeat
                                    end try
                                    try
                                        set stxts2 to every static text of sgrp
                                        repeat with stxt2 in stxts2
                                            set stxt2Val to value of stxt2
                                            set output to output & "        STATIC_TEXT val=" & stxt2Val & "\\n"
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


FALLBACK_SET_SCRIPT = """
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        set wins to every window
        repeat with w in wins
            try
                set tbars to every toolbar of w
                repeat with tb in tbars
                    set grps to every group of tb
                    repeat with grp in grps
                        set txts to every text field of grp
                        repeat with tf in txts
                            set tfVal to value of tf
                            set tfLen to length of tfVal
                            if tfLen >= 2 and tfLen <= 7 then
                                try
                                    set tfNum to tfVal as number
                                    if tfNum >= 20 and tfNum <= 300 then
                                        set focused of tf to true
                                        delay 0.1
                                        set value of tf to "BPM_PLACEHOLDER"
                                        key code 36
                                        return "success:" & tfVal
                                    end if
                                end try
                            end if
                        end repeat
                    end repeat
                end repeat
            end try
        end repeat
        return "not_found"
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

    # Look for text fields whose value looks like a BPM (20-300, with optional decimals)
    bpm_pattern = re.compile(r'TEXT_FIELD desc=(.*?) val=(\d{2,3}(?:\.\d+)?)\s')
    matches = bpm_pattern.findall(output)

    # Filter to plausible BPM range
    bpm_matches = [(desc, val) for desc, val in matches if 20 <= float(val) <= 300]

    if bpm_matches:
        print("\nPotential tempo fields found:")
        for desc, val in bpm_matches:
            print(f"  description='{desc}', current value='{val}'")
        return bpm_matches
    else:
        print("\nNo obvious tempo field found in text fields.")
        print("The tempo may be a static text or custom-drawn element.")
        print("Check the raw hierarchy above to look for a value matching your current BPM.")
        return None


def set_logic_bpm(bpm: float, tempo_field_description: str = None):
    """
    Set Logic Pro's tempo to the given BPM.

    Args:
        bpm: The target BPM (e.g. 128.0)
        tempo_field_description: The accessibility description of the tempo text field,
                                  found via probe_logic_ui(). If None, auto-detection is used.
    """
    bpm_str = f"{bpm:.4f}"

    if tempo_field_description:
        script = f"""
tell application "System Events"
    tell process "Logic Pro"
        set frontmost to true
        set wins to every window
        repeat with w in wins
            try
                set tbars to every toolbar of w
                repeat with tb in tbars
                    set grps to every group of tb
                    repeat with grp in grps
                        set txts to every text field of grp
                        repeat with tf in txts
                            if description of tf is "{tempo_field_description}" then
                                set focused of tf to true
                                delay 0.1
                                set value of tf to "{bpm_str}"
                                key code 36
                                return "success"
                            end if
                        end repeat
                    end repeat
                end repeat
            end try
        end repeat
        return "not_found"
    end tell
end tell
"""
    else:
        script = FALLBACK_SET_SCRIPT.replace("BPM_PLACEHOLDER", bpm_str)

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"AppleScript error: {result.stderr.strip()}\n"
            f"Try running probe_logic_ui() to inspect the UI hierarchy."
        )

    output = result.stdout.strip()
    if output == "not_found":
        raise RuntimeError(
            "Could not locate the tempo field.\n"
            "Run probe_logic_ui() to find the correct field description."
        )

    print(f"BPM set to {bpm} (previously: {output.replace('success:', '')})")


if __name__ == "__main__":
    matches = probe_logic_ui()

    if matches:
        tempo_desc = matches[0][0]
        print(f"\nUsing field with description: '{tempo_desc}'")
        print("Setting BPM to 128...")
        set_logic_bpm(128.0, tempo_field_description=tempo_desc)
    else:
        print("\nFalling back to auto-detection...")
        set_logic_bpm(128.0)

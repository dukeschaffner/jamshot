

## Overview
users should be able to create a project from a collab tree.


## Details
- when uploading original track, user can specify option "allow remix projects" - default true. if true, user can create a project from any track in the tree without requiring permission from the root track owner. if false, only the root track owner can create a project from tracks in the tree. root track owner should be able to change this option at any time.
- when user creates a project from a track, it should create a new project with the same files and regions, etc as the original track.
- if a project is created from a track, the project DAW should expose an option "import files from collab chain". when clicked, it should open a modal where users can select files from the collab tree in an intuitive way. 
- invite members view should ALSO have a "invite users from collab chain" option. when clicked, it should open a modal where users can select users from the collab tree in an intuitive way.
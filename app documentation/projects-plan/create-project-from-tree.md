

## Overview
users should be able to create a project from a collab tree.


## Details
- when uploading original track, user can specify option "allow remix projects" - default true. if true, user can create a project from any track in the tree without requiring permission from the root track owner. if false, only the root track owner can create a project from tracks in the tree. root track owner should be able to change this option at any time. this can be true for all existing tracks.
- add new option "Create project from track" in the Track component's ellipses menu. on click, it should go to the create project page. the page should indicate that the project is being created from a track.
- when user creates a project from a track, it should create a new project with the same files and regions, etc as the original track. this should notify all contributors to the current track (not the entire tree, just current track user, parent track user, etc, up to the root track owner) via email.
- if a project is created from a track, the project DAW's files panel should include a tab "collab chain" that lists all the tracks in the collab chain in an infinite scroll. the list should display the tracks using the same components as the files in the audio files panel (although the file size may not be available). users should be able to drag a file from the collab chain list onto the project DAW's timeline to add it to the project, just like how it works in the audio files panel. this should add the file to the project. give me your recommendation for whether the generated asset should link to the original file in R2 or create a new copy of the file in the project.
- invite members view should ALSO have a "invite users from collab chain" option - if project was created from a collab chain. when clicked, it should open a modal where users can select users from the collab tree in an intuitive way. im thinking like an infinite scroll list of users who are not already in the project, have not already been invited, and have published a track in the collab chain.
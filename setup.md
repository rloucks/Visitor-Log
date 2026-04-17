# Easy Visitor Check-in
This is to be an easy to use tool that will allow a simple ipad connection and a server based web application
in nodejs that is interactive and can communicate with slack, n8n and google calendar. This is tracking to allow
for NIST compliance. 

### Tools Used
- 11" IPad
- Fedora Server
- Google Workspace connection via N8N
- N8N Connectivity
- Slack Connectivity
- a Database?
- Storage of the Visitor Data (we have a NAS that can be used)

### Application Requirements
- Web Admin Interface
- Reporting Interface for visitation

# Workflow
When idle, it will have a "screensaver" that is tapped to initate the visitor check-in. The system will pull from a 
list of employees from that are allowed to have visitors. The visitor then selects who they are visiting
from that list, the person then enters thier First Name, Last Name and Company - at this point it is okay to auto fill
from if the person has visited before as well. This should then send a slack comms to both the person being visted 
and to the #security channel, as well tracking added to the databased as part of the "Visitor Log"

# The Idle Screen
When the system is idle, I would like the option to have a centered logo with an animated background. This should be part
of the admin options to be able to upload the image (logo) and select from a small variety of animated backgrounds

# The Admin Screen
The admin screen should be pretty basic, but allow for the following functions:
 - Check connectivity to IPad
 - Check network connectivity
 - Add admin users
 - Review logs of visitors
 - Pull printable reports of visitors
 - Edit the visuals of the IPad (colors, idle screen, etc)
 
# Inital Look and Feel
The inital look an feel should be:
 - Background is black with potential animation
 - Roboto is a preffered font
 - White text
 - Input fields and buttons are white background, black text
 
 
 # Future Addition
 - We want to be able to allow a web portal so users can check-in from their mobile phone and the same notification workflow will happen.
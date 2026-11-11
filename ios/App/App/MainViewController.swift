// StaffList — registers the app's own plugins with Capacitor.
// Set this class on the Bridge View Controller in Main.storyboard (see native/README.md).

import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ExternalDisplayPlugin())
    }
}

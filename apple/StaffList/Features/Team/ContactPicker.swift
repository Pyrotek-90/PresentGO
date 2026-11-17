import ContactsUI
import UIKit

/// The system contact picker. It needs no Contacts permission: the person picks one contact and
/// only that contact's name, first email and first phone number come back.
@MainActor
enum ContactPicker {
    struct Picked { let name: String; let email: String?; let phone: String? }

    private static var delegate: Delegate?

    static func present(onPick: @escaping (Picked) -> Void) {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }

        let picker = CNContactPickerViewController()
        picker.displayedPropertyKeys = [CNContactEmailAddressesKey, CNContactPhoneNumbersKey]
        let d = Delegate { contact in
            let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
            onPick(Picked(name: name,
                          email: contact.emailAddresses.first.map { String($0.value) },
                          phone: contact.phoneNumbers.first?.value.stringValue))
        }
        delegate = d
        picker.delegate = d
        top.present(picker, animated: true)
    }

    @MainActor private final class Delegate: NSObject, CNContactPickerDelegate {
        let onPick: (CNContact) -> Void
        init(onPick: @escaping (CNContact) -> Void) { self.onPick = onPick }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            onPick(contact)
            ContactPicker.delegate = nil
        }
        func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
            ContactPicker.delegate = nil
        }
    }
}

/*
 * Copyright © 2011 Faidon Liambotis <paravoid@debian.org>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * Alternatively, you can redistribute and/or modify this program under the
 * same terms that the “gnome-shell” or “gnome-shell-extensions” software
 * packages are being distributed by The GNOME Project.
 *
 */

const St = imports.gi.St;
const Lang = imports.lang;
const Status = imports.ui.status;
const Panel = imports.ui.panel;
const Main = imports.ui.main;

function init(meta) {
    // empty
}

function enable() {
    // monkey-patch the existing battery icon, called "that" henceforth
    let that = Main.panel._statusArea['battery'];

    if (that._withLabel || that.actor.get_children().length != 1) {
        // weird state!? reinitialize the original battery applet
        disable();
    }

    // add a method to the original power indicator that replaces the single
    // icon with the combo icon/label; this is dynamically called the first time
    // a battery is found in the _updateLabel() method
    that._replaceIconWithBox = function replaceIconWithBox() {
        let icon = this.actor.get_children()[0];

        // flag this we are enabled
        this._withLabel = true;

        // remove the initial actor of the single icon
        this.actor.remove_actor(icon);

        // create a new box layout, composed of a) a "bin", b) the label
        let box = new St.BoxLayout({ name: 'batteryBox' });
        this.actor.add_actor(box);
        this._iconBox = new St.Bin();
        box.add(this._iconBox, { y_align: St.Align.MIDDLE, y_fill: false });

        this._label = new St.Label();
        box.add(this._label, { y_align: St.Align.MIDDLE, y_fill: false });

        // finally, put the original icon into the bin
        this._iconBox.child = icon;
    };

    // now, we must ensure that our percentage label is updated
    // hence, create a function that enumerates the devices and, if a battery
    // is found, updates the label with the percentage point
    // (code heavily borrowed from ui.status.power)
    that._updateLabel = function updateLabel() {
        this._proxy.GetDevicesRemote(Lang.bind(this, function(devices, error) {
            if (error) {
                if (this._withLabel) {
                    this._label.set_text("");
                }
                return;
            }
            let position = 0;
            for (let i = 0; i < devices.length; i++) {
                let [device_id, device_type, icon, percentage, state, time] = devices[i];
                if (device_type == Status.power.UPDeviceType.BATTERY || device_id == this._primaryDeviceId) {
                    percentageText = C_("percent of battery remaining", "%d%%").format(Math.round(percentage));

                    if (!this._withLabel) {
                        this._replaceIconWithBox();
                    }
                    this._label.set_text(percentageText);
                    return;
                }
            }
            // no battery found... hot-unplugged?
            this._label.set_text("");
        }));
    };
    that._proxy.connect('Changed', Lang.bind(that, that._updateLabel));
    that._updateLabel();
}

function disable() {
    let position = Panel.STANDARD_STATUS_AREA_ORDER.indexOf('battery');

    for (let i = 0; i < Main.panel._rightBox.get_children().length; i++) {
        if (Main.panel._statusArea['battery'] == Main.panel._rightBox.get_children()[i]._delegate) {
            position = i + 1;
            Main.panel._rightBox.get_children()[i].destroy();
            break;
        } 
    }
    Main.panel._statusArea['battery'] = null;

    let indicator = new Panel.STANDARD_STATUS_AREA_SHELL_IMPLEMENTATION['battery'];
    Main.panel.addToStatusArea('battery', indicator, position);
}

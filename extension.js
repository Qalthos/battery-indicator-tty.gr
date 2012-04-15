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

function monkeypatch(that) {
    // add a method to the original power indicator that replaces the single
    // icon with the combo icon/label; this is dynamically called the first time
    // a battery is found in the _updateLabel() method
    that._replaceIconWithBox = function replaceIconWithBox() {
        if (this._withLabel)
            return;
        this._withLabel = true;

        let icon = this.actor.get_children()[0];

        // remove the initial actor of the single icon
        this.actor.remove_actor(icon);

        // create a new box layout, composed of a) a "bin", b) the label
        let box = new St.BoxLayout({ name: 'batteryBox' });
        this.actor.add_actor(box);

        let iconBox = new St.Bin();
        box.add(iconBox, { y_align: St.Align.MIDDLE, y_fill: false });

        this._label = new St.Label();
        box.add(this._label, { y_align: St.Align.MIDDLE, y_fill: false });

        // finally, put the original icon into the bin
        iconBox.child = icon;
    };

    // do the exact opposite: replace the box with the original icon and
    // destroy the bin/box. i.e. revert the original behavior, useful
    // when disabling the extension :-)
    that._replaceBoxWithIcon = function replaceBoxWithIcon() {
        if (!this._withLabel)
            return;
        this._withLabel = false;

        let box = this.actor.get_children()[0];
        let bin = box.get_children()[0];
        let label = box.get_children()[1];
        let icon = bin.child;

        this.actor.remove_actor(box);
        icon.reparent(this.actor);

        label.destroy();
        bin.destroy();
        box.destroy();
    }

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

            // for some peculiar reason, there isn't always a primary device,
            // even on simple laptop configurations with a single battery.
            // Hence, instead of using GetPrimaryDevice, we enumerate all
            // devices, and then either pick the primary if found or fallback
            // on the first battery found
            let match, battStat;
            for (let i = 0; i < devices.length; i++) {
                let [device_id, device_type, icon, percentage, state, time] = devices[i];
                if (device_type != Status.power.UPDeviceType.BATTERY)
                    continue;

                if (!match || device_id == this._primaryDeviceId) {
                    battStat = state;
                    let hours = time / 3600;
                    let minutes = time / 60 % 60;
                    if (minutes < 10) {
                        minutes = "0" + minutes;
                    }
                    minutes = minutes.substring(0, 2);

                    if (state == 1 || state == 2) {
                        match = "%d:%s".format(hours, minutes);
                        if (state == 2) {
                            match = "(" + match + ")";
                        }
                    }
                    else {
                        match = "%d%%".format(percentage);
                    }

                    if (device_id == this._primaryDeviceId) {
                        // the primary is preferred, no reason to keep searching
                        break;
                    }
                }
            }

            if (match) {
                let percentageText = C_("percent of battery remaining", "%s").format(match);

                if (!this._withLabel) {
                    this._replaceIconWithBox();
                }
                this._label.set_text(percentageText);
                if (battStat == 1) { //Charging
                    this._label.set_style_class_name("green");
                } else if (battStat == 2) { //Discharging
                    this._label.set_style_class_name("red");
                } else {
                    this._label.set_style_class_name("yellow");
                }
            } else {
                // no battery found... hot-unplugged?
                this._label.set_text("");
            }
        }));
    };
}

function enable() {
    // monkey-patch the existing battery icon, called "that" henceforth
    let that = Main.panel._statusArea['battery'];
    if (!that)
        return;

    monkeypatch(that);

    // hook our extension to the signal and do the initial update
    that._labelSignalId = that._proxy.connect('Changed', Lang.bind(that, that._updateLabel));
    that._updateLabel();
}

function disable() {
    let that = Main.panel._statusArea['battery'];
    if (!that)
        return;

    try {
        if (that._labelSignalId) {
            that._proxy.disconnect(that._labelSignalId);
        }
        that._replaceBoxWithIcon();
    } finally {
        delete that._replaceIconWithBox;
        delete that._replaceBoxWithIcon;
        delete that._updateLabel;
        delete that._labelSignalId;
        delete that._label;
        delete that._withLabel;
    }
}

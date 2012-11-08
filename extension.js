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

function init() {}

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
                log(error);
                if (this._withLabel) {
                    this._label.set_text("Error");
                }
                return;
            }

            // It seems to be a collection containing a single collection...
            // not sure why
            devices=devices[0];

            // for some peculiar reason, there isn't always a primary device,
            // even on simple laptop configurations with a single battery.
            // Hence, instead of using GetPrimaryDevice, we enumerate all
            // devices, and then either pick the primary if found or fallback
            // on the first battery found
            let text = [], bState, bPct = [], sumPct=0;
            for (let i = 0; i < devices.length; i++) {
                let [device_id, device_type, icon, percentage, state, time] = devices[i];

                if (device_type != Status.power.UPDeviceType.BATTERY)
                    continue;

                bState = state;
                bPct.push(percentage);
                sumPct += percentage;
                let hours = time / 3600;
                let minutes = Math.floor(time / 60 % 60);
                if (minutes < 10) {
                    minutes = "0" + minutes;
                }

                if (time > 0 && (state == 1 || state == 2)) {
                    let timeString = "%d:%s".format(hours, minutes);
                    if (state == 2) {
                        timeString = ("(" + timeString + ")");
                    }
                    text.push(timeString);
                }
                else if(state == 4) {
                    text.push("Full");
                }
                else {
                    log("Not sure what " + state + " is");
                    text.push("%d%%".format(percentage));
                }
            }

            bPct = sumPct / bPct.length;

            if (text) {
                let percentageText = C_("percent of battery remaining", "%s").format(text);

                if (!this._withLabel) {
                    this._replaceIconWithBox();
                }
                this._label.set_text(percentageText);
                if (bPct > 60) { //Charging
                    this._label.set_style_class_name("green");
                } else if (bPct > 25) { //Discharging
                    this._label.set_style_class_name("yellow");
                } else {
                    this._label.set_style_class_name("red");
                }
            } else {
                // no battery found... hot-unplugged?
                this._label.set_text("Not found");
            }
        }));
    };
}

function enable() {
    // monkey-patch the existing battery icon, called "that" henceforth
    let that = Main.panel.statusArea['battery'];
    if (!that)
        return;

    monkeypatch(that);

    // hook our extension to the signal and do the initial update
    that._labelSignalId = that._proxy.connect('g-properties-changed', Lang.bind(that, that._updateLabel));
    that._replaceIconWithBox();
    that._updateLabel();
}

function disable() {
    let that = Main.panel.statusArea['battery'];
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

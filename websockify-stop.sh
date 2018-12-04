#!/bin/bash

declare -A web_array
declare -A web_array2
declare -A vm_array
TMPFILE_WEB=$(mktemp -u /tmp/tmp.XXXXXXXX) || exit 1
TMPFILE_VM=$(mktemp -u /tmp/tmp.XXXXXXXX) || exit 1
id=$1
web_port=-1
vm_port=-1
web_file=/etc/ovp-config/webid-spice.conf
vm_file=/etc/ovp-config/vmid-spice.conf
if [ ! -e ${web_file} ]
then
	return
fi
if [ ! -e ${vm_file} ]
then 
	return
fi

awk -F"[{}]" '{printf $2}' ${web_file} | awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_WEB}
while read a b; do web_array[$a]=$b;done < ${TMPFILE_WEB}

awk -F"[{}]" '{printf $2}' ${vm_file} | awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_VM}
while read a b; do vm_array[$a]=$b;done < ${TMPFILE_VM}	

for key in ${!web_array[*]}
do
	if [ $key = $id ]
	then
		web_port=${web_array[$key]}
		break
	fi
done

for key in ${!vm_array[*]}
do
	if [ $key = $id ]
	then
		vm_port=${vm_array[$key]}
		break
	fi
done

websockify_script_pid=$(ps aux | grep "/usr/sbin/websockify.sh ${id}" | grep -v "grep" | awk '{printf "%s ",$2}')
/usr/bin/kill -9 ${websockify_script_pid}

websockify_pid=$(ps aux | grep "${web_port} 127.0.0.1:${vm_port}" | grep -v "grep" | awk '{printf "%s ",$2}')
/usr/bin/kill  -9 ${websockify_pid}

{
    flock -x 3
    [ $? -eq 1 ] && { echo fail; exit; }
    awk -F"[{}]" '{printf $2}' ${web_file} |awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_WEB}
    while read a b; do web_array2[$a]=$b;done < ${TMPFILE_WEB}
    unset web_array2[$id]
    str={
    count=0
    length=${#web_array2[*]}
    for key in ${!web_array2[*]}
    do
    count=`expr ${count} + 1`
    if [ ${count} -eq ${length} ]
    then
        str=${str}"\"${key}\":${web_array2[$key]}" 
    else    
        str=${str}"\"${key}\":${web_array2[$key]},"
    fi
    done
    str=${str}"}"
    echo ${str} > ${web_file}
} 3<>/etc/ovp-config/webid-spice.conf
